import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import axios from 'axios';
import { 
  AiConfigData, 
  AiHarnessSettings, 
  AiProviderConfig, 
  AiChatSession, 
  AiChatMessage, 
  AiStreamEvent, 
  AiToolCallRecord, 
  AiModelItem,
  NeoEnvironment,
  TokenData
} from '../../shared/types';
import { 
  BUILTIN_AI_PROVIDERS, 
  DEFAULT_AI_SETTINGS, 
  CRM_HARNESS_TOOLS_SPEC 
} from '../../shared/constants';
import { MetadataService } from './metadataService';
import { DataService } from './dataService';
import { SessionStore } from './sessionStore';

export class AiService {
  private activeControllers = new Map<string, AbortController>();

  constructor(
    private sessionStore: SessionStore,
    private metadataService: MetadataService,
    private dataService: DataService
  ) {}

  private getConfigPath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'neocrm_ai_config.json');
  }

  private getSessionsPath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'neocrm_ai_sessions.json');
  }

  // ================= 配置管理 =================

  public getAiConfig(): AiConfigData {
    const filePath = this.getConfigPath();
    if (!fs.existsSync(filePath)) {
      const initial: AiConfigData = {
        providers: BUILTIN_AI_PROVIDERS,
        settings: DEFAULT_AI_SETTINGS,
      };
      this.saveAiConfig(initial);
      return initial;
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      // 保证预设供应商完整性（如版本更新后合并新模型或新预设）
      const existingProviders: AiProviderConfig[] = data.providers || [];
      const mergedProviders = [...existingProviders];

      for (const builtin of BUILTIN_AI_PROVIDERS) {
        const found = mergedProviders.find((p) => p.id === builtin.id);
        if (!found) {
          mergedProviders.push(builtin);
        } else {
          // 补充新预设字段与新模型
          if (!found.models || found.models.length === 0) {
            found.models = builtin.models;
          }
        }
      }

      const mergedSettings: AiHarnessSettings = {
        ...DEFAULT_AI_SETTINGS,
        ...(data.settings || {}),
      };

      return {
        providers: mergedProviders,
        settings: mergedSettings,
      };
    } catch (e) {
      console.error('读取 AI 配置失败，恢复默认:', e);
      return {
        providers: BUILTIN_AI_PROVIDERS,
        settings: DEFAULT_AI_SETTINGS,
      };
    }
  }

  public saveAiConfig(config: AiConfigData): boolean {
    try {
      fs.writeFileSync(this.getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('保存 AI 配置失败:', e);
      return false;
    }
  }

  public saveAiSettings(settings: Partial<AiHarnessSettings>): AiHarnessSettings {
    const config = this.getAiConfig();
    config.settings = { ...config.settings, ...settings };
    this.saveAiConfig(config);
    return config.settings;
  }

  public saveProvider(provider: AiProviderConfig): AiProviderConfig[] {
    const config = this.getAiConfig();
    const idx = config.providers.findIndex((p) => p.id === provider.id);
    const now = Date.now();
    const item = { ...provider, updatedAt: now };

    if (idx >= 0) {
      config.providers[idx] = item;
    } else {
      item.createdAt = now;
      config.providers.push(item);
    }

    this.saveAiConfig(config);
    return config.providers;
  }

  public deleteProvider(providerId: string): AiProviderConfig[] {
    const config = this.getAiConfig();
    config.providers = config.providers.filter((p) => p.id !== providerId);
    if (config.settings.defaultProviderId === providerId) {
      config.settings.defaultProviderId = config.providers[0]?.id || 'deepseek';
      config.settings.defaultModelId = config.providers[0]?.models?.[0]?.id || 'deepseek-chat';
    }
    this.saveAiConfig(config);
    return config.providers;
  }

  // ================= 供应商连接与模型探测 =================

  public async testProvider(provider: AiProviderConfig): Promise<{ success: boolean; message: string; responseTimeMs?: number }> {
    const start = Date.now();
    const baseUrl = provider.baseUrl?.trim().replace(/\/+$/, '') || '';
    if (!baseUrl) {
      return { success: false, message: 'Base URL 地址不能为空' };
    }

    try {
      if (provider.protocol === 'anthropic-messages') {
        const res = await axios.post(
          `${baseUrl}/messages`,
          {
            model: provider.models?.[0]?.id || 'claude-3-5-haiku-latest',
            max_tokens: 5,
            messages: [{ role: 'user', content: 'hi' }],
          },
          {
            headers: {
              'x-api-key': provider.apiKey || '',
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );
        return {
          success: true,
          message: `连接成功 (HTTP ${res.status})`,
          responseTimeMs: Date.now() - start,
        };
      }

      // OpenAI 协议：优先尝试 GET /models，若失败则发极简 chat 请求
      try {
        const modelsRes = await axios.get(`${baseUrl}/models`, {
          headers: {
            Authorization: `Bearer ${provider.apiKey || ''}`,
          },
          timeout: 8000,
        });
        if (modelsRes.status === 200) {
          const count = Array.isArray(modelsRes.data?.data) ? modelsRes.data.data.length : 0;
          return {
            success: true,
            message: `连接成功！探测到 ${count} 个可用模型`,
            responseTimeMs: Date.now() - start,
          };
        }
      } catch (e: any) {
        // 部分中转禁止 GET /models，尝试轻量 chat completions
      }

      const testModel = provider.models?.[0]?.id || 'deepseek-chat';
      const chatRes = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model: testModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        },
        {
          headers: {
            Authorization: `Bearer ${provider.apiKey || ''}`,
            'Content-Type': 'application/json',
          },
          timeout: 12000,
        }
      );

      return {
        success: true,
        message: `连通性正常 (模型 ${testModel} 响应正常)`,
        responseTimeMs: Date.now() - start,
      };
    } catch (err: any) {
      const errMsg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
      return {
        success: false,
        message: `连接失败: ${errMsg}`,
        responseTimeMs: Date.now() - start,
      };
    }
  }

  public async fetchAvailableModels(provider: AiProviderConfig): Promise<{ success: boolean; models: AiModelItem[]; error?: string }> {
    const baseUrl = provider.baseUrl?.trim().replace(/\/+$/, '') || '';
    if (!baseUrl) {
      return { success: false, models: [], error: 'Base URL 地址不能为空' };
    }

    try {
      const res = await axios.get(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${provider.apiKey || ''}`,
        },
        timeout: 10000,
      });

      const rawList = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
      if (!rawList || rawList.length === 0) {
        return { success: false, models: [], error: '接口未返回模型列表' };
      }

      const models: AiModelItem[] = rawList.map((item: any) => {
        const id = typeof item === 'string' ? item : item.id || item.name;
        const name = typeof item === 'object' && item.name ? item.name : id;
        const lowerId = id.toLowerCase();
        const isReasoning = lowerId.includes('r1') || lowerId.includes('reasoner') || lowerId.includes('o1') || lowerId.includes('o3') || lowerId.includes('qwq');
        return {
          id,
          name,
          reasoning: isReasoning,
          tools: !isReasoning,
          contextWindow: 65536,
          maxOutputTokens: 8192,
        };
      });

      return { success: true, models };
    } catch (e: any) {
      return {
        success: false,
        models: [],
        error: e.response?.data?.error?.message || e.message || '获取模型列表失败',
      };
    }
  }

  // ================= 会话历史管理 =================

  public getSessions(): AiChatSession[] {
    const filePath = this.getSessionsPath();
    if (!fs.existsSync(filePath)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  public saveSession(session: AiChatSession): AiChatSession[] {
    const sessions = this.getSessions();
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      sessions[idx] = session;
    } else {
      sessions.unshift(session);
    }
    fs.writeFileSync(this.getSessionsPath(), JSON.stringify(sessions, null, 2), 'utf-8');
    return sessions;
  }

  public deleteSession(sessionId: string): AiChatSession[] {
    const sessions = this.getSessions().filter((s) => s.id !== sessionId);
    fs.writeFileSync(this.getSessionsPath(), JSON.stringify(sessions, null, 2), 'utf-8');
    return sessions;
  }

  public clearSessions(): boolean {
    fs.writeFileSync(this.getSessionsPath(), JSON.stringify([], null, 2), 'utf-8');
    return true;
  }

  // ================= 对话流与 Agent Harness 核心 =================

  public abortChatStream(requestId: string): boolean {
    const controller = this.activeControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(requestId);
      return true;
    }
    return false;
  }

  public async startChatStream(
    params: {
      requestId: string;
      sessionId: string;
      messageId: string;
      providerId: string;
      modelId: string;
      presetPrompt?: string;
      messages: AiChatMessage[];
      enableTools?: boolean;
    },
    sendEvent: (event: AiStreamEvent) => void
  ): Promise<void> {
    const { requestId, sessionId, messageId, providerId, modelId, presetPrompt, messages, enableTools } = params;

    const config = this.getAiConfig();
    const provider = config.providers.find((p) => p.id === providerId) || config.providers[0];
    if (!provider) {
      sendEvent({
        requestId,
        sessionId,
        messageId,
        type: 'error',
        error: '未找到选定的模型供应商，请前往设置配置',
      });
      return;
    }

    if (!provider.apiKey && provider.id !== 'ollama' && !provider.baseUrl.includes('127.0.0.1') && !provider.baseUrl.includes('localhost')) {
      sendEvent({
        requestId,
        sessionId,
        messageId,
        type: 'error',
        error: `供应商 [${provider.name}] 尚未配置 API Key，请在顶部【系统设置】中完成配置。`,
      });
      return;
    }

    const currentSession = this.sessionStore.getCurrentSession();
    const controller = new AbortController();
    this.activeControllers.set(requestId, controller);

    try {
      // 1. 组装 System Prompt
      const systemParts: string[] = [];
      if (presetPrompt) {
        systemParts.push(presetPrompt);
      }

      if (config.settings.injectTenantContext && currentSession.isLoggedIn) {
        systemParts.push(`【当前连接的销售易租户事实环境】
- 租户名称: ${currentSession.tokenData?.userInfo?.tenantName || '未命名租户'}
- 租户 ID: ${currentSession.tokenData?.tenant_id || '未知'}
- 当前用户: ${currentSession.tokenData?.userInfo?.name || '未知用户'}
- 环境名称: ${currentSession.environment?.name || '生产环境'}
- 实例 BaseURL: ${currentSession.tokenData?.instance_uri || currentSession.environment?.neoBaseURL || ''}
你可以根据以上真实环境为用户提供针对性建议。当开启工具调用时，请主动调用销售易工具查阅真实对象与字段。`);
      }

      if (config.settings.customSystemPrompt?.trim()) {
        systemParts.push(`【用户自定义追加规范】\n${config.settings.customSystemPrompt.trim()}`);
      }

      const systemMessage = systemParts.length > 0 ? { role: 'system', content: systemParts.join('\n\n') } : null;

      // 2. 组装历史上下文（根据 contextLimit 截取最近消息）
      const contextLimit = config.settings.contextLimit || 20;
      const recentMessages = messages.slice(-contextLimit);

      // 3. 构建对话上下文列表
      const conversationHistory: any[] = [];
      if (systemMessage) {
        conversationHistory.push(systemMessage);
      }

      for (const msg of recentMessages) {
        if (msg.role === 'user') {
          let text = msg.content;
          // 若附带了引用的实体字典信息
          if (msg.entityRefs && msg.entityRefs.length > 0) {
            const refDesc = msg.entityRefs
              .map((r) => `[已挂载上下文对象: ${r.label} (${r.apiKey})]`)
              .join(', ');
            text = `${refDesc}\n\n${text}`;
          }
          conversationHistory.push({ role: 'user', content: text });
        } else if (msg.role === 'assistant') {
          conversationHistory.push({ role: 'assistant', content: msg.content });
        }
      }

      // 4. 判断是否开启工具调用
      const modelObj = provider.models?.find((m) => m.id === modelId);
      const isReasonerModel = modelObj?.reasoning || modelId.toLowerCase().includes('reasoner') || modelId.toLowerCase().includes('r1');
      const canUseTools = (enableTools !== false) && config.settings.enableCrmTools && !isReasonerModel && provider.protocol !== 'anthropic-messages';

      // 5. 执行 Agent Loop（最多循环 5 次）
      let loopCount = 0;
      const maxLoops = 5;
      let hasMoreIterations = true;

      while (hasMoreIterations && loopCount < maxLoops) {
        loopCount++;

        const requestBody: any = {
          model: modelId,
          messages: conversationHistory,
          temperature: config.settings.temperature ?? 0.3,
          max_tokens: config.settings.maxTokens || 4096,
          stream: true,
        };

        if (canUseTools) {
          requestBody.tools = CRM_HARNESS_TOOLS_SPEC;
          requestBody.tool_choice = 'auto';
        }

        const cleanBaseUrl = provider.baseUrl.trim().replace(/\/+$/, '');
        const endpoint = `${cleanBaseUrl}/chat/completions`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          let parsedError = errText;
          try {
            const parsed = JSON.parse(errText);
            parsedError = parsed.error?.message || parsed.message || errText;
          } catch {}
          throw new Error(`模型接口响应异常 (HTTP ${response.status}): ${parsedError}`);
        }

        if (!response.body) {
          throw new Error('未获取到流式响应数据主体');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        let assistantContent = '';
        let assistantReasoning = '';
        let isInThinkTag = false;
        let toolCallsMap: Record<number, { id: string; name: string; arguments: string }> = {};

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') continue;

            try {
              const chunk = JSON.parse(dataStr);
              const choice = chunk.choices?.[0];
              if (!choice) continue;

              const delta = choice.delta;
              if (!delta) continue;

              // 1. 处理 DeepSeek 原生 reasoning_content
              if (delta.reasoning_content) {
                assistantReasoning += delta.reasoning_content;
                sendEvent({
                  requestId,
                  sessionId,
                  messageId,
                  type: 'reasoning_delta',
                  delta: delta.reasoning_content,
                });
              }

              // 2. 处理常规 content（含 <think> 标签检测）
              if (delta.content) {
                let piece = delta.content;

                // 兼容部分模型输出 <think>...</think>
                if (piece.includes('<think>')) {
                  isInThinkTag = true;
                  const parts = piece.split('<think>');
                  if (parts[1]) {
                    assistantReasoning += parts[1];
                    sendEvent({
                      requestId,
                      sessionId,
                      messageId,
                      type: 'reasoning_delta',
                      delta: parts[1],
                    });
                  }
                  continue;
                }

                if (isInThinkTag) {
                  if (piece.includes('</think>')) {
                    isInThinkTag = false;
                    const parts = piece.split('</think>');
                    if (parts[0]) {
                      assistantReasoning += parts[0];
                      sendEvent({
                        requestId,
                        sessionId,
                        messageId,
                        type: 'reasoning_delta',
                        delta: parts[0],
                      });
                    }
                    if (parts[1]) {
                      assistantContent += parts[1];
                      sendEvent({
                        requestId,
                        sessionId,
                        messageId,
                        type: 'content_delta',
                        delta: parts[1],
                      });
                    }
                  } else {
                    assistantReasoning += piece;
                    sendEvent({
                      requestId,
                      sessionId,
                      messageId,
                      type: 'reasoning_delta',
                      delta: piece,
                    });
                  }
                  continue;
                }

                assistantContent += piece;
                sendEvent({
                  requestId,
                  sessionId,
                  messageId,
                  type: 'content_delta',
                  delta: piece,
                });
              }

              // 3. 处理 tool_calls 增量
              if (Array.isArray(delta.tool_calls)) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCallsMap[idx]) {
                    toolCallsMap[idx] = {
                      id: tc.id || `call_${Date.now()}_${idx}`,
                      name: tc.function?.name || '',
                      arguments: '',
                    };
                  }
                  if (tc.function?.name) {
                    toolCallsMap[idx].name = tc.function.name;
                  }
                  if (tc.function?.arguments) {
                    toolCallsMap[idx].arguments += tc.function.arguments;
                  }
                }
              }
            } catch {
              // 忽略非合法 JSON 行
            }
          }
        }

        const toolCallsList = Object.values(toolCallsMap);

        // 如果模型调用了工具，在主进程执行销售易本地工具并继续下一轮
        if (toolCallsList.length > 0) {
          conversationHistory.push({
            role: 'assistant',
            content: assistantContent || null,
            tool_calls: toolCallsList.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: tc.arguments,
              },
            })),
          });

          for (const tc of toolCallsList) {
            let args: any = {};
            try {
              args = JSON.parse(tc.arguments || '{}');
            } catch {
              args = {};
            }

            const toolRecord: AiToolCallRecord = {
              id: tc.id,
              name: tc.name,
              arguments: args,
              status: 'running',
            };

            // 发送工具开始事件
            sendEvent({
              requestId,
              sessionId,
              messageId,
              type: 'tool_start',
              toolCall: toolRecord,
            });

            // 执行本地销售易操作
            const toolStartTime = Date.now();
            let toolResult: any = null;
            let resultSummary = '';
            let isError = false;

            try {
              const res = await this.executeCrmTool(tc.name, args, currentSession.environment, currentSession.tokenData);
              toolResult = res.data;
              resultSummary = res.summary;
            } catch (toolErr: any) {
              isError = true;
              toolResult = { error: toolErr.message };
              resultSummary = `调用失败: ${toolErr.message}`;
            }

            toolRecord.status = isError ? 'error' : 'success';
            toolRecord.resultSummary = resultSummary;
            toolRecord.resultData = toolResult;
            toolRecord.durationMs = Date.now() - toolStartTime;

            // 发送工具执行完毕事件
            sendEvent({
              requestId,
              sessionId,
              messageId,
              type: 'tool_update',
              toolCall: toolRecord,
            });

            // 回填给大模型
            conversationHistory.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(toolResult),
            });
          }

          // 进入下一轮生成
          hasMoreIterations = true;
        } else {
          // 没有工具调用，生成结束
          hasMoreIterations = false;
        }
      }

      sendEvent({
        requestId,
        sessionId,
        messageId,
        type: 'done',
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        sendEvent({
          requestId,
          sessionId,
          messageId,
          type: 'done',
        });
        return;
      }
      sendEvent({
        requestId,
        sessionId,
        messageId,
        type: 'error',
        error: err.message || '对话生成异常中断',
      });
    } finally {
      this.activeControllers.delete(requestId);
    }
  }

  /**
   * 执行销售易本地 Harness 工具
   */
  private async executeCrmTool(
    name: string,
    args: any,
    env?: NeoEnvironment,
    tokenData?: TokenData
  ): Promise<{ data: any; summary: string }> {
    if (!env || !tokenData) {
      throw new Error('当前未登录销售易租户，无法访问租户元数据或数据接口');
    }

    if (name === 'get_tenant_info') {
      const info = {
        tenantName: tokenData.userInfo?.tenantName,
        tenantId: tokenData.tenant_id,
        userName: tokenData.userInfo?.name,
        envName: env.name,
        instanceUri: tokenData.instance_uri || env.neoBaseURL,
      };
      return {
        data: info,
        summary: `成功读取当前租户: ${info.tenantName} (${info.envName})`,
      };
    }

    if (name === 'list_entities') {
      const list = await this.metadataService.fetchEntityList(env, tokenData);
      let filtered = list;
      if (args.keyword) {
        const kw = String(args.keyword).toLowerCase();
        filtered = filtered.filter(
          (e) => e.apiKey.toLowerCase().includes(kw) || e.label.toLowerCase().includes(kw)
        );
      }
      if (args.isCustomOnly) {
        filtered = filtered.filter((e) => !e.isStandard);
      }
      return {
        data: filtered.slice(0, 50).map((e) => ({
          apiKey: e.apiKey,
          label: e.label,
          isStandard: e.isStandard,
          description: e.description,
        })),
        summary: `成功检索到 ${filtered.length} 个对象元数据`,
      };
    }

    if (name === 'get_entity_fields') {
      const apiKey = args.entityApiKey;
      if (!apiKey) throw new Error('缺少 entityApiKey 参数');
      const fields = await this.metadataService.fetchEntityFields(env, tokenData, apiKey);
      const summaryList = fields.slice(0, 80).map((f) => ({
        apiKey: f.apiKey,
        label: f.label,
        itemType: f.itemType,
        typeName: f.typeName,
        custom: f.custom,
        referObjectApiKey: f.referObjectApiKey,
        pickOptions: f.pickOption?.map((p) => p.optionLabel).slice(0, 10),
      }));
      return {
        data: {
          entityApiKey: apiKey,
          totalFields: fields.length,
          fields: summaryList,
        },
        summary: `成功加载 ${apiKey} 的 ${fields.length} 个字段定义`,
      };
    }

    if (name === 'execute_sql_query') {
      let sql = args.sql?.trim();
      if (!sql) throw new Error('缺少 sql 查询语句');
      if (!sql.toLowerCase().startsWith('select')) {
        throw new Error('出于数据安全保护，AI 工具仅允许执行 SELECT 查询');
      }
      // 限制单次返回条数
      if (!sql.toLowerCase().includes('limit')) {
        sql += ' LIMIT 30';
      }
      const queryRes = await this.dataService.executeQuery(env, tokenData, sql);
      return {
        data: {
          records: queryRes.records.slice(0, 30),
          totalSize: queryRes.totalSize,
          fields: queryRes.fields,
        },
        summary: `SQL 执行成功，返回 ${queryRes.records.length} 条数据`,
      };
    }

    throw new Error(`未知工具名称: ${name}`);
  }
}
