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
      const existingProviders: AiProviderConfig[] = data.providers || [];
      const mergedProviders: AiProviderConfig[] = [];

      // 1. 先按 BUILTIN_AI_PROVIDERS 顺序对齐内置供应商，确保新增的内置供应商（如 Gemini）排在正确位置
      for (const builtin of BUILTIN_AI_PROVIDERS) {
        const found = existingProviders.find((p) => p.id === builtin.id);
        if (!found) {
          mergedProviders.push(builtin);
        } else {
          if (!found.models || found.models.length === 0) {
            found.models = builtin.models;
          }
          mergedProviders.push(found);
        }
      }

      // 2. 追加用户自定义的供应商
      for (const ep of existingProviders) {
        if (!mergedProviders.some((m) => m.id === ep.id)) {
          mergedProviders.push(ep);
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
      // 1. Google Gemini 原生协议测试
      if (provider.protocol === 'google-gemini' && !baseUrl.endsWith('/openai')) {
        const apiKey = provider.apiKey?.trim() || '';
        if (!apiKey) {
          return { success: false, message: '请先输入 Google Gemini API Key' };
        }

        try {
          const modelsRes = await axios.get(`${baseUrl}/models?key=${encodeURIComponent(apiKey)}`, {
            headers: { 'x-goog-api-key': apiKey },
            timeout: 10000,
          });
          if (modelsRes.status === 200 && Array.isArray(modelsRes.data?.models)) {
            const count = modelsRes.data.models.length;
            return {
              success: true,
              message: `Gemini 连接成功！探测到 ${count} 个可用模型`,
              responseTimeMs: Date.now() - start,
            };
          }
        } catch {
          // 若代理不支持 /models，回退到极简 generateContent 测试
        }

        const testModel = (provider.models?.[0]?.id || 'gemini-2.0-flash').replace(/^models\//, '');
        const genRes = await axios.post(
          `${baseUrl}/models/${testModel}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
            generationConfig: { maxOutputTokens: 5 },
          },
          {
            headers: {
              'x-goog-api-key': apiKey,
              'Content-Type': 'application/json',
            },
            timeout: 12000,
          }
        );

        return {
          success: true,
          message: `Gemini 连通性正常 (模型 ${testModel} 响应 HTTP ${genRes.status})`,
          responseTimeMs: Date.now() - start,
        };
      }

      // 2. Anthropic 协议测试
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

      // 3. OpenAI 兼容协议：优先尝试 GET /models，若失败则发极简 chat 请求
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
        message: `连通性正常 (模型 ${testModel} 响应 HTTP ${chatRes.status})`,
        responseTimeMs: Date.now() - start,
      };
    } catch (err: any) {
      const errMsg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message;
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
      // Google Gemini 原生模型列表解析
      if (provider.protocol === 'google-gemini' && !baseUrl.endsWith('/openai')) {
        const apiKey = provider.apiKey?.trim() || '';
        const res = await axios.get(`${baseUrl}/models?key=${encodeURIComponent(apiKey)}`, {
          headers: { 'x-goog-api-key': apiKey },
          timeout: 10000,
        });

        const rawModels = Array.isArray(res.data?.models) ? res.data.models : [];
        if (rawModels.length === 0) {
          return { success: false, models: [], error: 'Gemini 接口未返回可用模型列表' };
        }

        const models: AiModelItem[] = rawModels
          .filter((item: any) => {
            if (Array.isArray(item.supportedGenerationMethods)) {
              return item.supportedGenerationMethods.includes('generateContent');
            }
            return String(item.name || '').includes('gemini');
          })
          .map((item: any) => {
            const rawName = String(item.name || '');
            const id = rawName.replace(/^models\//, '');
            const displayName = item.displayName ? `${item.displayName} (${id})` : id;
            const lowerId = id.toLowerCase();
            const isReasoning = lowerId.includes('2.5') || lowerId.includes('thinking');
            return {
              id,
              name: displayName,
              reasoning: isReasoning,
              tools: !lowerId.includes('thinking'),
              contextWindow: item.inputTokenLimit || 1048576,
              maxOutputTokens: item.outputTokenLimit || 65536,
            };
          });

        return { success: true, models };
      }

      // OpenAI 兼容格式模型列表解析
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
        const lowerId = String(id).toLowerCase();
        const isReasoning =
          lowerId.includes('r1') ||
          lowerId.includes('reasoner') ||
          lowerId.includes('o1') ||
          lowerId.includes('o3') ||
          lowerId.includes('qwq') ||
          lowerId.includes('thinking') ||
          lowerId.includes('gemini-2.5');
        return {
          id,
          name,
          reasoning: isReasoning,
          tools: !lowerId.includes('reasoner') && !lowerId.includes('thinking'),
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

      const systemPromptText = systemParts.join('\n\n');
      const systemMessage = systemPromptText ? { role: 'system', content: systemPromptText } : null;

      // 2. 截取最近上下文消息
      const contextLimit = config.settings.contextLimit || 20;
      const recentMessages = messages.slice(-contextLimit);

      const cleanBaseUrl = provider.baseUrl.trim().replace(/\/+$/, '');

      // 判断是否走 Google Gemini 原生协议
      if (provider.protocol === 'google-gemini' && !cleanBaseUrl.endsWith('/openai')) {
        await this.runGeminiNativeStream({
          requestId,
          sessionId,
          messageId,
          provider,
          modelId,
          systemPromptText,
          recentMessages,
          enableTools: (enableTools !== false) && config.settings.enableCrmTools,
          settings: config.settings,
          currentSession,
          controller,
          sendEvent,
        });
        return;
      }

      // 3. 构建 OpenAI 兼容对话上下文列表
      const conversationHistory: any[] = [];
      if (systemMessage) {
        conversationHistory.push(systemMessage);
      }

      for (const msg of recentMessages) {
        if (msg.role === 'user') {
          let text = msg.content;
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
      const lowerModelId = modelId.toLowerCase();
      const isPureReasoner =
        lowerModelId.includes('reasoner') ||
        lowerModelId.includes('deepseek-r1') ||
        lowerModelId.includes('thinking') ||
        lowerModelId.includes('qwq');
      const canUseTools =
        (enableTools !== false) &&
        config.settings.enableCrmTools &&
        (modelObj?.tools ?? !isPureReasoner) &&
        provider.protocol !== 'anthropic-messages';

      // 5. 执行 Agent Loop（最多 3 轮工具调用 + 智能去重与上下文直注总结兜底）
      let loopCount = 0;
      const maxToolLoops = 3;
      let hasMoreIterations = true;
      let totalContentGenerated = '';
      const calledToolSignatures = new Set<string>();
      const executedToolsLog: Array<{ name: string; args: any; summary: string; data: any }> = [];

      while (hasMoreIterations && loopCount < maxToolLoops) {
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

        if (assistantContent) {
          totalContentGenerated += assistantContent;
        }

        const toolCallsList = Object.values(toolCallsMap);

        if (toolCallsList.length > 0) {
          // 检查是否全都是已经调用过的完全相同工具（说明中转网关可能丢弃了 role:tool 历史导致模型死循环）
          const allDuplicates = toolCallsList.every((tc) => {
            let parsedArgs = {};
            try {
              parsedArgs = JSON.parse(tc.arguments || '{}');
            } catch {}
            return calledToolSignatures.has(`${tc.name}:${JSON.stringify(parsedArgs)}`);
          });

          if (allDuplicates && executedToolsLog.length > 0) {
            // 检测到重复调用同一工具，跳出工具循环，直接进入下方的无工具总结轮
            hasMoreIterations = false;
            break;
          }

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

            const signature = `${tc.name}:${JSON.stringify(args)}`;
            calledToolSignatures.add(signature);

            const toolRecord: AiToolCallRecord = {
              id: tc.id,
              name: tc.name,
              arguments: args,
              status: 'running',
            };

            sendEvent({
              requestId,
              sessionId,
              messageId,
              type: 'tool_start',
              toolCall: toolRecord,
            });

            const toolStartTime = Date.now();
            let toolResult: any = null;
            let resultSummary = '';
            let isError = false;

            try {
              const res = await this.executeCrmTool(tc.name, args, currentSession.environment, currentSession.tokenData);
              toolResult = res.data;
              resultSummary = res.summary;
              executedToolsLog.push({
                name: tc.name,
                args,
                summary: res.summary,
                data: res.data,
              });
            } catch (toolErr: any) {
              isError = true;
              toolResult = { error: toolErr.message };
              resultSummary = `调用失败: ${toolErr.message}`;
            }

            toolRecord.status = isError ? 'error' : 'success';
            toolRecord.resultSummary = resultSummary;
            toolRecord.resultData = toolResult;
            toolRecord.durationMs = Date.now() - toolStartTime;

            sendEvent({
              requestId,
              sessionId,
              messageId,
              type: 'tool_update',
              toolCall: toolRecord,
            });

            conversationHistory.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(toolResult),
            });
          }

          hasMoreIterations = true;
        } else {
          hasMoreIterations = false;
        }
      }

      // 6. 兜底总结收敛轮：如果调用了工具但尚未输出最终正文（例如达到工具轮上限，或网关未正确透传 tool 消息）
      if (!totalContentGenerated.trim() && executedToolsLog.length > 0) {
        const cleanSynthesisHistory: any[] = [];
        if (systemMessage) {
          cleanSynthesisHistory.push(systemMessage);
        }

        // 保留前面的普通 user/assistant 消息
        for (const msg of recentMessages.slice(0, -1)) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            cleanSynthesisHistory.push({ role: msg.role, content: msg.content });
          }
        }

        const lastUserMsg = recentMessages[recentMessages.length - 1];
        const toolDataContext = executedToolsLog
          .map(
            (t, idx) =>
              `【本地工具调用 #${idx + 1}: ${t.name}(${JSON.stringify(t.args)}) -> ${t.summary}】
返回真实数据:
---
${JSON.stringify(t.data, null, 2)}
---`
          )
          .join('\n\n');

        cleanSynthesisHistory.push({
          role: 'user',
          content: `${lastUserMsg?.content || '请分析以上数据'}

---
系统已为您自动调取到当前销售易租户的以下真实元数据/业务数据：

${toolDataContext}

请直接基于以上真实数据，用专业、清晰的中文 Markdown 格式（包含合理的分类、结构化表格与深入解读）给出完整详尽的最终回答：`,
        });

        const synthesisResponse = await fetch(`${cleanBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            messages: cleanSynthesisHistory,
            temperature: config.settings.temperature ?? 0.3,
            max_tokens: config.settings.maxTokens || 4096,
            stream: true,
          }),
          signal: controller.signal,
        });

        if (synthesisResponse.ok && synthesisResponse.body) {
          const reader = synthesisResponse.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';
          let isInThinkTag = false;

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
                const delta = chunk.choices?.[0]?.delta;
                if (!delta) continue;

                if (delta.reasoning_content) {
                  sendEvent({
                    requestId,
                    sessionId,
                    messageId,
                    type: 'reasoning_delta',
                    delta: delta.reasoning_content,
                  });
                }

                if (delta.content) {
                  let piece = delta.content;
                  if (piece.includes('<think>')) {
                    isInThinkTag = true;
                    const parts = piece.split('<think>');
                    if (parts[1]) {
                      sendEvent({ requestId, sessionId, messageId, type: 'reasoning_delta', delta: parts[1] });
                    }
                    continue;
                  }
                  if (isInThinkTag) {
                    if (piece.includes('</think>')) {
                      isInThinkTag = false;
                      const parts = piece.split('</think>');
                      if (parts[0]) {
                        sendEvent({ requestId, sessionId, messageId, type: 'reasoning_delta', delta: parts[0] });
                      }
                      if (parts[1]) {
                        sendEvent({ requestId, sessionId, messageId, type: 'content_delta', delta: parts[1] });
                      }
                    } else {
                      sendEvent({ requestId, sessionId, messageId, type: 'reasoning_delta', delta: piece });
                    }
                    continue;
                  }
                  sendEvent({
                    requestId,
                    sessionId,
                    messageId,
                    type: 'content_delta',
                    delta: piece,
                  });
                }
              } catch {}
            }
          }
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
   * Google Gemini 原生 REST API 流式对话与工具调用引擎
   */
  private async runGeminiNativeStream(opts: {
    requestId: string;
    sessionId: string;
    messageId: string;
    provider: AiProviderConfig;
    modelId: string;
    systemPromptText: string;
    recentMessages: AiChatMessage[];
    enableTools: boolean;
    settings: AiHarnessSettings;
    currentSession: any;
    controller: AbortController;
    sendEvent: (event: AiStreamEvent) => void;
  }): Promise<void> {
    const {
      requestId,
      sessionId,
      messageId,
      provider,
      modelId,
      systemPromptText,
      recentMessages,
      enableTools,
      settings,
      currentSession,
      controller,
      sendEvent,
    } = opts;

    const cleanBaseUrl = provider.baseUrl.trim().replace(/\/+$/, '');
    const cleanModelId = modelId.replace(/^models\//, '');
    const apiKey = provider.apiKey.trim();

    // 1. 组装 Gemini contents (role: 'user' | 'model')
    const geminiContents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];

    for (const msg of recentMessages) {
      if (msg.role === 'user') {
        let text = msg.content;
        if (msg.entityRefs && msg.entityRefs.length > 0) {
          const refDesc = msg.entityRefs
            .map((r) => `[已挂载上下文对象: ${r.label} (${r.apiKey})]`)
            .join(', ');
          text = `${refDesc}\n\n${text}`;
        }
        const prev = geminiContents[geminiContents.length - 1];
        if (prev && prev.role === 'user') {
          prev.parts.push({ text });
        } else {
          geminiContents.push({ role: 'user', parts: [{ text }] });
        }
      } else if (msg.role === 'assistant' && msg.content) {
        const prev = geminiContents[geminiContents.length - 1];
        if (prev && prev.role === 'model') {
          prev.parts.push({ text: msg.content });
        } else {
          geminiContents.push({ role: 'model', parts: [{ text: msg.content }] });
        }
      }
    }

    // 2. 判断是否支持工具调用
    const isThinkingExp = cleanModelId.toLowerCase().includes('thinking');
    const canUseTools = enableTools && !isThinkingExp;

    // 转换 OpenAI tools 为 Gemini functionDeclarations
    const geminiFunctionDeclarations = CRM_HARNESS_TOOLS_SPEC.map((spec) => {
      const fn = spec.function;
      const hasProps = fn.parameters?.properties && Object.keys(fn.parameters.properties).length > 0;
      return {
        name: fn.name,
        description: fn.description,
        ...(hasProps ? { parameters: fn.parameters } : {}),
      };
    });

    let loopCount = 0;
    const maxToolLoops = 4;
    const maxLoops = 5;
    let hasMoreIterations = true;

    while (hasMoreIterations && loopCount < maxLoops) {
      loopCount++;
      const isFinalSummaryTurn = loopCount > maxToolLoops;

      const requestBody: any = {
        contents: geminiContents,
        generationConfig: {
          temperature: settings.temperature ?? 0.3,
          maxOutputTokens: settings.maxTokens || 8192,
        },
      };

      if (systemPromptText) {
        requestBody.systemInstruction = {
          parts: [{ text: systemPromptText }],
        };
      }

      if (canUseTools && !isFinalSummaryTurn) {
        requestBody.tools = [{ functionDeclarations: geminiFunctionDeclarations }];
      }

      const endpoint = `${cleanBaseUrl}/models/${cleanModelId}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        let parsedError = errText;
        try {
          const parsed = JSON.parse(errText);
          parsedError = parsed.error?.message || parsed[0]?.error?.message || errText;
        } catch {}
        throw new Error(`Gemini 接口响应异常 (HTTP ${response.status}): ${parsedError}`);
      }

      if (!response.body) {
        throw new Error('未获取到 Gemini 流式响应主体');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      const modelTurnParts: any[] = [];
      const pendingFunctionCalls: Array<{ id: string; name: string; args: any }> = [];

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
          if (!dataStr || dataStr === '[DONE]') continue;

          try {
            const chunk = JSON.parse(dataStr);
            const parts = chunk.candidates?.[0]?.content?.parts;
            if (!Array.isArray(parts)) continue;

            for (const part of parts) {
              // 1. Gemini 2.5 / Thinking 原生思考块 (part.thought === true)
              if (part.thought && part.text) {
                sendEvent({
                  requestId,
                  sessionId,
                  messageId,
                  type: 'reasoning_delta',
                  delta: part.text,
                });
                continue;
              }

              // 2. 常规文本输出
              if (typeof part.text === 'string' && part.text.length > 0) {
                modelTurnParts.push({ text: part.text });
                sendEvent({
                  requestId,
                  sessionId,
                  messageId,
                  type: 'content_delta',
                  delta: part.text,
                });
              }

              // 3. Gemini Function Call
              if (part.functionCall && part.functionCall.name) {
                modelTurnParts.push({ functionCall: part.functionCall });
                pendingFunctionCalls.push({
                  id: `gemini_tc_${Date.now()}_${pendingFunctionCalls.length}`,
                  name: part.functionCall.name,
                  args: part.functionCall.args || {},
                });
              }
            }
          } catch {
            // 忽略单行解析异常
          }
        }
      }

      if (pendingFunctionCalls.length > 0) {
        geminiContents.push({
          role: 'model',
          parts: modelTurnParts,
        });

        const functionResponseParts: any[] = [];

        for (const fc of pendingFunctionCalls) {
          const toolRecord: AiToolCallRecord = {
            id: fc.id,
            name: fc.name,
            arguments: fc.args,
            status: 'running',
          };

          sendEvent({
            requestId,
            sessionId,
            messageId,
            type: 'tool_start',
            toolCall: toolRecord,
          });

          const toolStartTime = Date.now();
          let toolResult: any = null;
          let resultSummary = '';
          let isError = false;

          try {
            const res = await this.executeCrmTool(
              fc.name,
              fc.args,
              currentSession.environment,
              currentSession.tokenData
            );
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

          sendEvent({
            requestId,
            sessionId,
            messageId,
            type: 'tool_update',
            toolCall: toolRecord,
          });

          functionResponseParts.push({
            functionResponse: {
              name: fc.name,
              response: {
                result: toolResult,
              },
            },
          });
        }

        geminiContents.push({
          role: 'user',
          parts: functionResponseParts,
        });

        hasMoreIterations = true;
      } else {
        hasMoreIterations = false;
      }
    }

    sendEvent({
      requestId,
      sessionId,
      messageId,
      type: 'done',
    });
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
      const items = filtered.slice(0, 250).map((e) => ({
        apiKey: e.apiKey,
        label: e.label,
        isStandard: e.isStandard,
        ...(e.description ? { description: e.description } : {}),
      }));
      return {
        data: {
          totalCount: filtered.length,
          returnedCount: items.length,
          entities: items,
          _hint: '已返回全部匹配的对象列表，请直接基于此列表进行归类与结构分析，无需重复调用 list_entities。',
        },
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
      if (!sql.toLowerCase().includes('limit')) {
        sql += ' LIMIT 30';
      }
      const queryRes = await this.dataService.executeQuery(env, tokenData, sql);
      if (!queryRes.success || !queryRes.data) {
        throw new Error(queryRes.error || 'SQL 执行返回失败');
      }
      const records = queryRes.data.records || [];
      const fields = queryRes.data.fields || (records.length > 0 ? Object.keys(records[0]) : []);
      const totalSize = queryRes.data.totalSize ?? records.length;
      return {
        data: {
          records: records.slice(0, 30),
          totalSize,
          fields,
        },
        summary: `SQL 执行成功，返回 ${records.length} 条数据`,
      };
    }

    throw new Error(`未知工具名称: ${name}`);
  }
}
