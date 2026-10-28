import { spawn } from 'node:child_process';
import { McpServerConfig, McpToolItem } from '../../shared/types';

export class McpClientService {
  /**
   * 组装 MCP 服务器的认证与自定义请求头
   */
  public buildHeaders(srv: McpServerConfig): Record<string, string> {
    const headers: Record<string, string> = {
      ...(srv.headers || {}),
    };

    if (srv.authType === 'bearer' && srv.bearerToken?.trim()) {
      const clean = srv.bearerToken.trim().replace(/^Bearer\s+/i, '');
      headers['Authorization'] = `Bearer ${clean}`;
    } else if (srv.authType === 'basic' && srv.basicUsername?.trim()) {
      const cred = `${srv.basicUsername.trim()}:${srv.basicPassword || ''}`;
      headers['Authorization'] = `Basic ${Buffer.from(cred, 'utf-8').toString('base64')}`;
    }

    return headers;
  }

  /**
   * 连接 MCP 服务并探测/同步其可用工具列表 (tools/list)
   */
  public async discoverTools(srv: McpServerConfig): Promise<{
    success: boolean;
    tools: McpToolItem[];
    serverInfo?: any;
    error?: string;
  }> {
    if (srv.type === 'builtin' || srv.id === 'neocrm-paas-mcp') {
      return { success: true, tools: [] };
    }

    try {
      if (srv.type === 'sse') {
        return await this.discoverSseTools(srv);
      } else if (srv.type === 'stdio') {
        return await this.discoverStdioTools(srv);
      }
      return { success: false, tools: [], error: `不支持的传输类型: ${srv.type}` };
    } catch (e: any) {
      console.error(`[MCP] 探测服务 ${srv.name} 工具失败:`, e);
      return {
        success: false,
        tools: [],
        error: e.message || '连接 MCP 服务失败',
      };
    }
  }

  /**
   * 调用外部 MCP 服务上的指定工具 (tools/call)
   */
  public async callTool(
    srv: McpServerConfig,
    toolName: string,
    args: Record<string, any>,
    signal?: AbortSignal
  ): Promise<{
    success: boolean;
    data: any;
    summary: string;
    error?: string;
  }> {
    try {
      if (srv.type === 'sse') {
        return await this.callSseTool(srv, toolName, args, signal);
      } else if (srv.type === 'stdio') {
        return await this.callStdioTool(srv, toolName, args, signal);
      }
      throw new Error(`不支持的 MCP 传输类型: ${srv.type}`);
    } catch (e: any) {
      return {
        success: false,
        data: { error: e.message || 'MCP 工具执行异常' },
        summary: `调用 ${srv.name} 失败: ${e.message}`,
        error: e.message,
      };
    }
  }

  // ================= SSE / Streamable HTTP 协议实现 =================

  private async executeSseSession<T>(
    srv: McpServerConfig,
    action: (sendRpc: (method: string, params?: any, isNotify?: boolean) => Promise<any>) => Promise<T>,
    timeoutMs = 25000,
    externalSignal?: AbortSignal
  ): Promise<T> {
    const rawUrl = srv.url?.trim();
    if (!rawUrl) {
      throw new Error('SSE Endpoint URL 不能为空');
    }

    const baseHeaders = this.buildHeaders(srv);
    const controller = new AbortController();
    const abortHandler = () => controller.abort();
    externalSignal?.addEventListener('abort', abortHandler, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const pendingRequests = new Map<
      number | string,
      { resolve: (val: any) => void; reject: (err: any) => void }
    >();

    let rpcIdCounter = 1;
    let postEndpointUrl: string | null = null;
    let sessionIdHeader: string | null = null;

    let endpointReadyResolve: ((url: string) => void) | null = null;
    let endpointReadyReject: ((err: any) => void) | null = null;
    const endpointReadyPromise = new Promise<string>((resolve, reject) => {
      endpointReadyResolve = resolve;
      endpointReadyReject = reject;
    });

    const handleIncomingJsonRpc = (text: string) => {
      try {
        const msg = JSON.parse(text);
        if (msg && msg.id !== undefined && pendingRequests.has(msg.id)) {
          const handler = pendingRequests.get(msg.id)!;
          pendingRequests.delete(msg.id);
          if (msg.error) {
            handler.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            handler.resolve(msg.result !== undefined ? msg.result : msg);
          }
        }
      } catch {}
    };

    try {
      // 1. 发起 GET 请求建立 SSE 通道
      const sseRes = await fetch(rawUrl, {
        method: 'GET',
        headers: {
          ...baseHeaders,
          Accept: 'text/event-stream, application/json',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });

      const mcpSession = sseRes.headers.get('mcp-session-id');
      if (mcpSession) {
        sessionIdHeader = mcpSession;
      }

      const contentType = sseRes.headers.get('content-type') || '';

      // 如果服务端对 GET 返回 405 或非 event-stream，尝试直接把 rawUrl 当作 Streamable HTTP POST 端点
      if (sseRes.status === 405 || (!contentType.includes('text/event-stream') && sseRes.status >= 400)) {
        if (!sseRes.ok && sseRes.status === 401) {
          throw new Error('MCP 服务鉴权失败 (HTTP 401 Unauthorized)，请检查 Token 或账号密码配置');
        }
        if (!sseRes.ok && sseRes.status === 403) {
          throw new Error('MCP 服务拒绝访问 (HTTP 403 Forbidden)，请检查权限或请求头');
        }
        postEndpointUrl = rawUrl;
        endpointReadyResolve?.(rawUrl);
      } else if (!sseRes.ok) {
        const errBody = await sseRes.text().catch(() => '');
        throw new Error(`MCP 连接返回 HTTP ${sseRes.status}: ${errBody.slice(0, 200)}`);
      } else if (sseRes.body) {
        // 异步读取 SSE 事件流
        (async () => {
          const reader = sseRes.body!.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';
          let currentEvent = 'message';
          let currentDataLines: string[] = [];

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/\r?\n/);
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line === '') {
                  // 事件块结束
                  if (currentDataLines.length > 0) {
                    const dataStr = currentDataLines.join('\n').trim();
                    if (currentEvent === 'endpoint' || (!postEndpointUrl && (dataStr.startsWith('/') || dataStr.startsWith('http')))) {
                      try {
                        const resolvedUrl = new URL(dataStr, rawUrl).toString();
                        postEndpointUrl = resolvedUrl;
                        endpointReadyResolve?.(resolvedUrl);
                      } catch {
                        postEndpointUrl = dataStr;
                        endpointReadyResolve?.(dataStr);
                      }
                    } else {
                      handleIncomingJsonRpc(dataStr);
                    }
                  }
                  currentEvent = 'message';
                  currentDataLines = [];
                } else if (line.startsWith('event:')) {
                  currentEvent = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                  currentDataLines.push(line.slice(5).trim());
                }
              }
            }
          } catch (streamErr: any) {
            if (!controller.signal.aborted) {
              endpointReadyReject?.(streamErr);
            }
          }
        })();
      } else {
        postEndpointUrl = rawUrl;
        endpointReadyResolve?.(rawUrl);
      }

      // 等待 endpoint 就绪（最多等待 6 秒，若未收到 endpoint 事件则回退直接使用 rawUrl）
      const targetPostUrl = await Promise.race([
        endpointReadyPromise,
        new Promise<string>((resolve) => setTimeout(() => resolve(postEndpointUrl || rawUrl), 5000)),
      ]);

      // 定义发送 JSON-RPC 的函数
      const sendRpc = async (method: string, params?: any, isNotify = false): Promise<any> => {
        const rpcId = isNotify ? undefined : rpcIdCounter++;
        const payload: any = {
          jsonrpc: '2.0',
          method,
          ...(params !== undefined ? { params } : {}),
          ...(rpcId !== undefined ? { id: rpcId } : {}),
        };

        const postHeaders: Record<string, string> = {
          ...baseHeaders,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        };
        if (sessionIdHeader) {
          postHeaders['mcp-session-id'] = sessionIdHeader;
        }

        let rpcPromise: Promise<any> | null = null;
        if (!isNotify && rpcId !== undefined) {
          rpcPromise = new Promise((resolve, reject) => {
            pendingRequests.set(rpcId, { resolve, reject });
          });
        }

        const postRes = await fetch(targetPostUrl, {
          method: 'POST',
          headers: postHeaders,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        const newSessionId = postRes.headers.get('mcp-session-id');
        if (newSessionId) {
          sessionIdHeader = newSessionId;
        }

        if (!postRes.ok) {
          const errText = await postRes.text().catch(() => '');
          pendingRequests.delete(rpcId!);
          throw new Error(`MCP POST (${method}) 失败 [HTTP ${postRes.status}]: ${errText.slice(0, 200)}`);
        }

        if (isNotify) {
          return true;
        }

        // 检查 POST 响应体是否直接包含了结果
        const postContentType = postRes.headers.get('content-type') || '';
        const postBodyText = await postRes.text().catch(() => '');
        if (postBodyText.trim()) {
          if (postContentType.includes('application/json') || postBodyText.trim().startsWith('{')) {
            handleIncomingJsonRpc(postBodyText.trim());
          } else if (postContentType.includes('text/event-stream') || postBodyText.includes('data:')) {
            const lines = postBodyText.split(/\r?\n/);
            for (const l of lines) {
              if (l.startsWith('data:')) {
                handleIncomingJsonRpc(l.slice(5).trim());
              }
            }
          }
        }

        return await rpcPromise;
      };

      // 2. 执行标准 MCP Initialize 握手
      try {
        await sendRpc('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'NeoCRM-Desktop',
            version: '1.3.6',
          },
        });
        await sendRpc('notifications/initialized', undefined, true).catch(() => {});
      } catch (initErr: any) {
        console.warn('[MCP] Initialize 握手警告 (继续尝试调用):', initErr.message);
      }

      // 3. 执行具体操作
      const result = await action(sendRpc);
      return result;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abortHandler);
      controller.abort();
    }
  }

  private async discoverSseTools(srv: McpServerConfig): Promise<{
    success: boolean;
    tools: McpToolItem[];
    serverInfo?: any;
    error?: string;
  }> {
    return await this.executeSseSession(srv, async (sendRpc) => {
      const res = await sendRpc('tools/list', {});
      const rawTools = Array.isArray(res?.tools) ? res.tools : Array.isArray(res) ? res : [];
      const tools: McpToolItem[] = rawTools.map((t: any) => ({
        name: String(t.name || ''),
        description: String(t.description || `调用 ${srv.name} 的 ${t.name} 工具`),
        inputSchema: t.inputSchema || t.parameters || { type: 'object', properties: {} },
      })).filter((t: McpToolItem) => Boolean(t.name));

      return {
        success: true,
        tools,
      };
    });
  }

  private async callSseTool(
    srv: McpServerConfig,
    toolName: string,
    args: Record<string, any>,
    signal?: AbortSignal
  ): Promise<{
    success: boolean;
    data: any;
    summary: string;
  }> {
    return await this.executeSseSession(srv, async (sendRpc) => {
      if (signal?.aborted) throw Object.assign(new Error('对话已停止'), { name: 'AbortError' });
      const res = await sendRpc('tools/call', {
        name: toolName,
        arguments: args || {},
      });

      // 解析标准 MCP content 数组
      let textOutput = '';
      if (Array.isArray(res?.content)) {
        textOutput = res.content
          .map((item: any) => {
            if (item.type === 'text') return item.text;
            return JSON.stringify(item);
          })
          .join('\n');
      } else if (typeof res === 'string') {
        textOutput = res;
      } else {
        textOutput = JSON.stringify(res, null, 2);
      }

      const isErr = res?.isError === true;
      return {
        success: !isErr,
        data: res?.content ? { content: textOutput, raw: res } : res,
        summary: isErr
          ? `MCP 工具 [${toolName}] 返回错误`
          : `MCP [${srv.name}] 执行 ${toolName} 成功 (${textOutput.length} 字符)`,
      };
    }, 25000, signal);
  }

  // ================= Stdio 本地子进程协议实现 =================

  private async executeStdioSession<T>(
    srv: McpServerConfig,
    action: (sendRpc: (method: string, params?: any, isNotify?: boolean) => Promise<any>) => Promise<T>,
    timeoutMs = 20000,
    externalSignal?: AbortSignal
  ): Promise<T> {
    const cmd = srv.command?.trim();
    if (!cmd) throw new Error('Stdio 启动命令不能为空');

    return new Promise<T>((resolve, reject) => {
      const child = spawn(cmd, srv.args || [], {
        env: {
          ...process.env,
          ...(srv.env || {}),
        },
        shell: true,
      });

      const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
      let rpcId = 1;
      let stdoutBuf = '';

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Stdio MCP 进程响应超时 (${timeoutMs}ms)`));
      }, timeoutMs);
      const abortHandler = () => {
        child.kill();
        clearTimeout(timer);
        reject(Object.assign(new Error('对话已停止'), { name: 'AbortError' }));
      };
      externalSignal?.addEventListener('abort', abortHandler, { once: true });

      child.stdout.on('data', (chunk) => {
        stdoutBuf += chunk.toString('utf-8');
        const lines = stdoutBuf.split(/\r?\n/);
        stdoutBuf = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('{')) continue;
          try {
            const msg = JSON.parse(trimmed);
            if (msg.id !== undefined && pending.has(msg.id)) {
              const p = pending.get(msg.id)!;
              pending.delete(msg.id);
              if (msg.error) {
                p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
              } else {
                p.resolve(msg.result !== undefined ? msg.result : msg);
              }
            }
          } catch {}
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        externalSignal?.removeEventListener('abort', abortHandler);
        reject(new Error(`启动 Stdio 进程失败: ${err.message}`));
      });

      const sendRpc = (method: string, params?: any, isNotify = false): Promise<any> => {
        const id = isNotify ? undefined : rpcId++;
        const payload: any = {
          jsonrpc: '2.0',
          method,
          ...(params !== undefined ? { params } : {}),
          ...(id !== undefined ? { id } : {}),
        };

        return new Promise((resRpc, rejRpc) => {
          if (!isNotify && id !== undefined) {
            pending.set(id, { resolve: resRpc, reject: rejRpc });
          }
          child.stdin.write(JSON.stringify(payload) + '\n', 'utf-8', (err) => {
            if (err) {
              if (id !== undefined) pending.delete(id);
              rejRpc(err);
            } else if (isNotify) {
              resRpc(true);
            }
          });
        });
      };

      (async () => {
        try {
          await sendRpc('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'NeoCRM-Desktop', version: '1.3.6' },
          });
          await sendRpc('notifications/initialized', undefined, true).catch(() => {});
          const out = await action(sendRpc);
          clearTimeout(timer);
          externalSignal?.removeEventListener('abort', abortHandler);
          child.kill();
          resolve(out);
        } catch (e) {
          clearTimeout(timer);
          externalSignal?.removeEventListener('abort', abortHandler);
          child.kill();
          reject(e);
        }
      })();
    });
  }

  private async discoverStdioTools(srv: McpServerConfig): Promise<{
    success: boolean;
    tools: McpToolItem[];
    error?: string;
  }> {
    return await this.executeStdioSession(srv, async (sendRpc) => {
      const res = await sendRpc('tools/list', {});
      const rawTools = Array.isArray(res?.tools) ? res.tools : [];
      const tools: McpToolItem[] = rawTools.map((t: any) => ({
        name: String(t.name || ''),
        description: String(t.description || `调用 ${srv.name} 的 ${t.name} 工具`),
        inputSchema: t.inputSchema || t.parameters || { type: 'object', properties: {} },
      })).filter((t: McpToolItem) => Boolean(t.name));

      return { success: true, tools };
    });
  }

  private async callStdioTool(
    srv: McpServerConfig,
    toolName: string,
    args: Record<string, any>,
    signal?: AbortSignal
  ): Promise<{
    success: boolean;
    data: any;
    summary: string;
  }> {
    return await this.executeStdioSession(srv, async (sendRpc) => {
      if (signal?.aborted) throw Object.assign(new Error('对话已停止'), { name: 'AbortError' });
      const res = await sendRpc('tools/call', {
        name: toolName,
        arguments: args || {},
      });

      let textOutput = '';
      if (Array.isArray(res?.content)) {
        textOutput = res.content
          .map((item: any) => (item.type === 'text' ? item.text : JSON.stringify(item)))
          .join('\n');
      } else {
        textOutput = JSON.stringify(res, null, 2);
      }

      return {
        success: !res?.isError,
        data: res?.content ? { content: textOutput, raw: res } : res,
        summary: `MCP [${srv.name}] 执行 ${toolName} 完成`,
      };
    }, 20000, signal);
  }
}
