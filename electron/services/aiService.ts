import { CodeSyncService } from './codeSyncService';
function cleanGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return { type: "object", properties: {} };
  const copy = JSON.parse(JSON.stringify(schema));
  delete copy.$schema;
  delete copy.$id;
  delete copy.$defs;
  delete copy.definitions;
  delete copy.additionalProperties;
  if (!copy.type) copy.type = "object";
  if (copy.properties && typeof copy.properties === "object") {
    for (const k of Object.keys(copy.properties)) {
      copy.properties[k] = cleanGeminiSchema(copy.properties[k]);
    }
  }
  return copy;
}

import { McpClientService } from "./mcpClientService";
import { SkillPackageService } from "./skillPackageService";
import { WorkflowService } from "./workflowService";
import { PrintTemplateService } from "./printTemplateService";
import { DshToolService } from "./dshToolService";
import { licenseService } from "../security/licenseService";
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
  TokenData,
  McpServerConfig,
  McpToolItem,
  AiSkillItem
} from '../../shared/types';
import { 
  BUILTIN_AI_PROVIDERS, 
  DEFAULT_AI_SETTINGS, 
  BUILTIN_MCP_SERVERS, 
  BUILTIN_AI_SKILLS 
} from '../../shared/constants';
import { 
  CRM_HARNESS_TOOLS_SPEC, 
  getProtectedSkillInstruction, 
  isProtectedBuiltinSkill 
} from '../security/protectedHarness';
import { MetadataService } from './metadataService';
import { DataService } from './dataService';
import { SessionStore } from './sessionStore';

export class AiService {
  private activeControllers = new Map<string, AbortController>();

  private skillPackageService = new SkillPackageService();
  private mcpClientService = new McpClientService();
  private workflowService = new WorkflowService(this.metadataService);
  private printTemplateService = new PrintTemplateService(this.metadataService);
  private dshToolService = new DshToolService();
  private codeSyncService = new CodeSyncService(this.metadataService, this.dataService);

  constructor(
    private sessionStore: SessionStore,
    private metadataService: MetadataService,
    private dataService: DataService
  ) {}

  // ================= 技能包 ZIP 导入与导出 =================

  public async importSkillZipFromDialog(): Promise<{
    success: boolean;
    skills?: AiSkillItem[];
    importedCount?: number;
    importedNames?: string[];
    error?: string;
    canceled?: boolean;
  }> {
    const res = await this.skillPackageService.importSkillZipFromDialog();
    if (res.canceled) {
      return { success: false, canceled: true };
    }
    if (res.error || !res.skills || res.skills.length === 0) {
      return { success: false, error: res.error || "未读取到有效技能" };
    }

    const config = this.getAiConfig();
    const existingPersonal = (config.skills || []).filter((s) => s.category === "personal");
    const importedNames: string[] = [];

    for (const newSkill of res.skills) {
      const existingIdx = existingPersonal.findIndex((p) => p.name === newSkill.name);
      if (existingIdx >= 0) {
        existingPersonal[existingIdx] = { ...newSkill, id: existingPersonal[existingIdx].id };
      } else {
        existingPersonal.push(newSkill);
      }
      importedNames.push(newSkill.name);
    }

    config.skills = [
      ...(config.skills || []).filter((s) => s.category === "builtin"),
      ...existingPersonal,
    ];
    this.saveAiConfig(config);

    return {
      success: true,
      skills: config.skills,
      importedCount: res.skills.length,
      importedNames,
    };
  }

  public async importSkillZipFromBuffer(
    fileName: string,
    buffer: Buffer
  ): Promise<{
    success: boolean;
    skills?: AiSkillItem[];
    importedCount?: number;
    importedNames?: string[];
    error?: string;
  }> {
    const res = await this.skillPackageService.parseSkillZipBuffer(buffer, fileName);
    if (res.error || !res.skills || res.skills.length === 0) {
      return { success: false, error: res.error || "未读取到有效技能" };
    }

    const config = this.getAiConfig();
    const existingPersonal = (config.skills || []).filter((s) => s.category === "personal");
    const importedNames: string[] = [];

    for (const newSkill of res.skills) {
      const existingIdx = existingPersonal.findIndex((p) => p.name === newSkill.name);
      if (existingIdx >= 0) {
        existingPersonal[existingIdx] = { ...newSkill, id: existingPersonal[existingIdx].id };
      } else {
        existingPersonal.push(newSkill);
      }
      importedNames.push(newSkill.name);
    }

    config.skills = [
      ...(config.skills || []).filter((s) => s.category === "builtin"),
      ...existingPersonal,
    ];
    this.saveAiConfig(config);

    return {
      success: true,
      skills: config.skills,
      importedCount: res.skills.length,
      importedNames,
    };
  }

  public async exportSkillZip(
    skillIds?: string[]
  ): Promise<{
    success: boolean;
    filePath?: string;
    error?: string;
    canceled?: boolean;
  }> {
    const config = this.getAiConfig();
    let candidates = (config.skills || []).filter((s) => s.category === "personal");
    if (skillIds && skillIds.length > 0) {
      candidates = candidates.filter((s) => skillIds.includes(s.id));
    }
    if (candidates.length === 0) {
      return { success: false, error: "当前没有可导出的个人专属技能" };
    }
    return this.skillPackageService.exportSkillZip(candidates);
  }

  private getConfigPath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'neocrm_ai_config.json');
  }

  private getSessionsPath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'neocrm_ai_sessions.json');
  }

  // ================= 配置管理 (安全隔离与脱敏) =================

  public getAiConfig(): AiConfigData {
    const filePath = this.getConfigPath();
    if (!fs.existsSync(filePath)) {
      const initial: AiConfigData = {
        providers: BUILTIN_AI_PROVIDERS,
        settings: DEFAULT_AI_SETTINGS,
      };
      this.saveAiConfig(initial);
      return {
        ...initial,
        mcpServers: BUILTIN_MCP_SERVERS,
        skills: BUILTIN_AI_SKILLS.map((s) => ({ ...s, systemInstruction: undefined })),
      };
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const existingProviders: AiProviderConfig[] = data.providers || [];
      const mergedProviders: AiProviderConfig[] = [];

      // 1. 先按 BUILTIN_AI_PROVIDERS 顺序对齐内置供应商
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

      // 3. 处理 MCP 服务器列表合并 (内置 MCP 绝不向前端暴露内部工具列表)
      const customMcp: any[] = Array.isArray(data.customMcpServers)
        ? data.customMcpServers
        : Array.isArray(data.mcpServers)
        ? data.mcpServers.filter((m: any) => m.type !== "builtin" && m.id !== "neocrm-paas-mcp")
        : [];
      
      const builtinMcpEnabled = typeof data.builtinMcpEnabled === "boolean"
        ? data.builtinMcpEnabled
        : (data.mcpServers?.find((m: any) => m.id === "neocrm-paas-mcp")?.enabled ?? true);

      const mergedMcp: any[] = [
        {
          ...BUILTIN_MCP_SERVERS[0],
          enabled: builtinMcpEnabled,
          tools: [], // 绝不暴露内部工具定义
        },
        ...customMcp,
      ];

      // 4. 处理 Skill 技能列表合并 (内置系统技能脱敏，绝不向渲染进程发送明文指令)
      const rawPersonalSkills: AiSkillItem[] = Array.isArray(data.personalSkills)
        ? data.personalSkills
        : Array.isArray(data.skills)
        ? data.skills.filter((s: any) => s.category === "personal")
        : [];

      const builtinSkillStates: Record<string, boolean> = data.builtinSkillStates || {};
      if (Array.isArray(data.skills)) {
        for (const s of data.skills) {
          if (s.category === "builtin" && typeof s.enabled === "boolean") {
            builtinSkillStates[s.id] = s.enabled;
          }
        }
      }

      const mergedSkills: AiSkillItem[] = [];
      // (1) 内置技能：强制脱敏，不传输 systemInstruction
      for (const bs of BUILTIN_AI_SKILLS) {
        const isEnabled = typeof builtinSkillStates[bs.id] === "boolean" ? builtinSkillStates[bs.id] : bs.enabled;
        mergedSkills.push({
          ...bs,
          enabled: isEnabled,
          systemInstruction: undefined, // 严格脱敏
        });
      }
      // (2) 个人技能：保留用户自定义指令
      for (const ps of rawPersonalSkills) {
        mergedSkills.push(ps);
      }

      return {
        providers: mergedProviders,
        settings: mergedSettings,
        mcpServers: mergedMcp,
        skills: mergedSkills,
      };
    } catch (e) {
      console.error("读取 AI 配置失败，恢复默认:", e);
      return {
        providers: BUILTIN_AI_PROVIDERS,
        settings: DEFAULT_AI_SETTINGS,
        mcpServers: BUILTIN_MCP_SERVERS,
        skills: BUILTIN_AI_SKILLS.map((s) => ({ ...s, systemInstruction: undefined })),
      };
    }
  }

  public saveAiConfig(config: AiConfigData): boolean {
    try {
      // 1. 过滤只保留纯个人自定义技能，绝不落盘任何系统内置技能的 Prompt 指令
      const personalSkills = (config.skills || []).filter((s) => s.category === "personal");

      // 2. 提取内置技能的开关状态字典
      const builtinSkillStates: Record<string, boolean> = {};
      for (const s of (config.skills || [])) {
        if (s.category === "builtin" || isProtectedBuiltinSkill(s.id)) {
          builtinSkillStates[s.id] = Boolean(s.enabled);
        }
      }

      // 3. 过滤只保留自定义外部 MCP，绝不落盘内置 MCP 服务
      const customMcpServers = (config.mcpServers || []).filter(
        (m) => m.type !== "builtin" && m.id !== "neocrm-paas-mcp"
      );
      const builtinMcp = (config.mcpServers || []).find((m) => m.id === "neocrm-paas-mcp");
      const builtinMcpEnabled = builtinMcp ? Boolean(builtinMcp.enabled) : true;

      // 4. 组装干净的持久化数据结构落盘
      const sanitizedData = {
        providers: config.providers,
        settings: config.settings,
        personalSkills,
        builtinSkillStates,
        customMcpServers,
        builtinMcpEnabled,
      };

      fs.writeFileSync(this.getConfigPath(), JSON.stringify(sanitizedData, null, 2), "utf-8");
      return true;
    } catch (e) {
      console.error("保存 AI 配置失败:", e);
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

  // ================= MCP 服务器管理 (内核保护) =================

  public saveMcpServer(server: any): any[] {
    const config = this.getAiConfig();
    if (server.id === "neocrm-paas-mcp" || server.type === "builtin") {
      const found = (config.mcpServers || []).find((m) => m.id === "neocrm-paas-mcp");
      if (found) {
        found.enabled = Boolean(server.enabled);
      }
      this.saveAiConfig(config);
      return config.mcpServers || [];
    }

    const list = (config.mcpServers || []).filter((m) => m.type !== "builtin" && m.id !== "neocrm-paas-mcp");
    const idx = list.findIndex((m) => m.id === server.id);
    if (idx >= 0) {
      list[idx] = server;
    } else {
      list.push(server);
    }
    config.mcpServers = [
      (config.mcpServers || []).find((m) => m.id === "neocrm-paas-mcp") || BUILTIN_MCP_SERVERS[0],
      ...list,
    ];
    this.saveAiConfig(config);
    return config.mcpServers;
  }

  public deleteMcpServer(serverId: string): any[] {
    if (serverId === "neocrm-paas-mcp") {
      // 内置 MCP 严禁删除
      return this.getAiConfig().mcpServers || [];
    }
    const config = this.getAiConfig();
    config.mcpServers = (config.mcpServers || []).filter((m) => m.id !== serverId);
    this.saveAiConfig(config);
    return config.mcpServers;
  }

  // ================= Skill 技能管理 (系统内置严格受保护 + 个人自定义) =================

  public saveSkill(skill: any): any[] {
    const config = this.getAiConfig();
    if (skill.category === "builtin" || isProtectedBuiltinSkill(skill.id)) {
      // 内置技能受保护，仅允许更新启停状态，绝不接受来自客户端的任何指令篡改
      const found = (config.skills || []).find((s) => s.id === skill.id);
      if (found) {
        found.enabled = Boolean(skill.enabled);
      }
      this.saveAiConfig(config);
      return config.skills || [];
    }

    // 个人自定义技能保存
    const list = (config.skills || []).filter((s) => s.category === "personal");
    const idx = list.findIndex((s) => s.id === skill.id);
    const now = Date.now();
    const item = { ...skill, category: "personal", updatedAt: now };

    if (idx >= 0) {
      list[idx] = item;
    } else {
      item.createdAt = now;
      list.push(item);
    }
    config.skills = [
      ...(config.skills || []).filter((s) => s.category === "builtin"),
      ...list,
    ];
    this.saveAiConfig(config);
    return config.skills;
  }

  public deleteSkill(skillId: string): any[] {
    if (isProtectedBuiltinSkill(skillId)) {
      // 系统内置技能严禁删除
      return this.getAiConfig().skills || [];
    }
    const config = this.getAiConfig();
    config.skills = (config.skills || []).filter((s) => s.id !== skillId);
    this.saveAiConfig(config);
    return config.skills;
  }

  // ================= 上下文长对话压缩 (Context Compaction) =================

  public async compactSession(sessionId: string): Promise<AiChatSession | null> {
    const sessions = this.getSessions();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || session.messages.length <= 4) {
      return session || null;
    }

    const config = this.getAiConfig();
    const providerId = session.providerId || config.settings.defaultProviderId || 'deepseek';
    const provider = config.providers.find((p) => p.id === providerId) || config.providers[0];
    const modelId = session.modelId || provider?.models?.[0]?.id || 'deepseek-chat';

    // 取除最近 3 条之外的所有更早消息进行总结
    const messagesToCompact = session.messages.slice(0, -3);
    const recentMessages = session.messages.slice(-3);

    const dialogHistoryText = messagesToCompact
      .map((m) => `${m.role === 'user' ? '用户' : 'AI助手'}: ${m.content.slice(0, 500)}`)
      .join('\n\n');

    const prompt = `请为以下较早的 CRM 对话历史生成一份精炼的结构化记忆摘要（150~250字）。
必须包含：
1. 涉及的关键业务对象与 API Key；
2. 用户核心诉求与关键参数；
3. 已达成的结论或已创建的元数据信息。
对话内容如下：
${dialogHistoryText}`;

    let summaryText = '历史对话要点已压缩保留。';
    try {
      const cleanBaseUrl = provider.baseUrl.trim().replace(/\/+$/, '');
      const res = await axios.post(
        `${cleanBaseUrl}/chat/completions`,
        {
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 500,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${provider.apiKey}`,
          },
          timeout: 25000,
        }
      );
      summaryText = res.data?.choices?.[0]?.message?.content || summaryText;
    } catch {
      summaryText = `已压缩前 ${messagesToCompact.length} 轮历史对话（涵盖对象字典查询与数据分析记录）。`;
    }

    session.compactionSummary = {
      originalMessageCount: messagesToCompact.length,
      summary: summaryText.trim(),
      compactedAt: Date.now(),
    };
    session.messages = recentMessages;
    session.updatedAt = Date.now();

    this.saveSession(session);
    return session;
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
      const list: AiChatSession[] = Array.isArray(data) ? data : [];
      return list.filter((s) => Array.isArray(s.messages) && s.messages.length > 0);
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
      activeSkillIds?: string[];
      activeMcpServerIds?: string[];
      compactionSummary?: any;
      projectPath?: string;
    },
    sendEvent: (event: AiStreamEvent) => void
  ): Promise<void> {
    const { requestId, sessionId, messageId, providerId, modelId, presetPrompt, messages, enableTools, activeSkillIds, activeMcpServerIds, compactionSummary, projectPath } = params;

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
      // 筛选当前对话激活的外部自定义 MCP 服务
      const allCustomMcp = (config.mcpServers || []).filter(
        (m) => m.type !== "builtin" && m.id !== "neocrm-paas-mcp" && m.enabled
      );
      const activeCustomMcp =
        activeMcpServerIds && activeMcpServerIds.length > 0
          ? allCustomMcp.filter((m) => activeMcpServerIds.includes(m.id))
          : allCustomMcp;

      // 若自定义 MCP 尚未探测工具列表，在对话前快速探测一次
      for (const srv of activeCustomMcp) {
        const hasOnlyDefault =
          !srv.tools ||
          srv.tools.length === 0 ||
          (srv.tools.length === 1 && srv.tools[0].name.endsWith("_invoke") && !srv.tools[0].inputSchema);
        if (hasOnlyDefault) {
          try {
            const discoverRes = await this.mcpClientService.discoverTools(srv);
            if (discoverRes.success && discoverRes.tools.length > 0) {
              srv.tools = discoverRes.tools;
              this.saveMcpServer(srv);
            }
          } catch {}
        }
      }

      // 组装当前可用的全量 Function Calling 工具列表 (CRM 内核工具 + 外部 MCP 扩展工具)
      const builtinMcpEnabled =
        (config.mcpServers || []).find((m) => m.id === "neocrm-paas-mcp")?.enabled !== false;

      const activeToolsSpec: any[] = [];
      if (config.settings.enableCrmTools && builtinMcpEnabled) {
        activeToolsSpec.push(...CRM_HARNESS_TOOLS_SPEC);
      }

      for (const mcpSrv of activeCustomMcp) {
        for (const t of mcpSrv.tools || []) {
          const safeName = t.name.replace(/[^a-zA-Z0-9_-]/g, "_");
          if (!activeToolsSpec.some((existing) => existing.function?.name === safeName)) {
            activeToolsSpec.push({
              type: "function",
              function: {
                name: safeName,
                description: `[外部MCP服务: ${mcpSrv.name}] ${t.description || t.name}`,
                parameters: t.inputSchema || { type: "object", properties: {} },
              },
            });
          }
        }
      }

      // 0. 流程引擎专属安全锁强制校验 (自动流程与新版审批流共用内核级安全锁)
      const isAutoflowPreset = Boolean(presetPrompt && presetPrompt.includes("[PROTECTED_PRESET::autoflow-architect]"));
      const isApprovalPreset = Boolean(presetPrompt && presetPrompt.includes("[PROTECTED_PRESET::approval-architect]"));
      if (isAutoflowPreset || isApprovalPreset) {
        const lockStatus = licenseService.getLicenseStatus();
        if (!lockStatus.isAuthorized) {
          const featureName = isApprovalPreset ? "审批流高级功能" : "自动流程功能";
          sendEvent({
            requestId,
            sessionId,
            messageId,
            type: "error",
            error: `🔒 ${featureName}已上锁：${lockStatus.message || "请先输入本机专属加密密码完成设备激活"}`,
          });
          return;
        }
      }

      // 1. 组装 System Prompt (全面植入 DeepSeek Harness 官方智能体自主行动协议)
      const systemParts: string[] = [];

      systemParts.push(`【DeepSeek Harness 智能体自主行动与工程落地协议 (DSH Autonomous Agent Protocol)】
你不仅是一个语言模型，你是一个运行在桌面工作台内、拥有完整物理文件读写与终端命令执行权限的「自主行动型工程智能体 (Autonomous Coding Agent)」。
你拥有完整的 DeepSeek Harness 223 个内置插件工具链驱动支持（包含文件原子读写 read/write/edit、行级高精替换 str_replace_editor、Glob 路径检索、Grep 正则搜索、工作区命令执行 bash、任务待办清单状态机 todo_write、目标规划 goal、多 CRM 在线接口探测与元数据同步等）。当前本地项目物理工作区路径: ${projectPath || '未绑定工作区'}。

【智能体高智商行动准则 (必须严格遵守，彻底杜绝呆板被动)】：
0. 【任务清单闭环推进铁律 (Todo Completion Invariant - 极其重要！)】：
   - 当你在处理复杂任务时调用 todo_write 建立了任务清单，你必须负责到底，绝对严禁丢下未完成的任务直接输出最终汇报！
   - 每当你完成一个阶段工作（如完成字段调研、生成完物理文件、执行完测试脚本），必须紧接着调用 todo_write 将对应项状态更新为 completedcompleted，将下一项更新为 in_progressin_progress！
   - 严禁在任务清单仍有项处于 in_progress 或 pending 时擅自停止工具调用并退出循环！你必须持续调用工具逐一完成，直至清单中的所有任务全部变为 completedcompleted (全部完成)！
1. 【先调查后结论 (Investigate First)】：
   - 绝不凭空臆造事实或输出假大空的理论套话！
   - 面对用户的问题或需求，必须第一时间主动调用工具查清当前环境与代码的客观事实（例如：查看目录结构用 glob，查文件内容用 read，检索关键字用 grep，查元数据对象用 list_entities，查字段详情用 get_entity_fields）；
2. 【任务拆解与待办对账 (Todo State Machine)】：
   - 遇到多步骤、复合型或需要深入排查修改的任务，必须第一时间主动调用 todo_write 工具建立结构化待办清单；
   - 在执行具体步骤时，自主将对应清单项状态更新为 in_progress，完成时更新为 completed，让用户对你的进展一目了然；
3. 【代码与工程自主落地 (Execute Direct，绝不让用户手动敲终端)】：
   - 编写代码时，必须调用 write 或 edit 或 str_replace_editor 直接将代码真实写入当前工程文件，严禁只在 Markdown 里贴一堆代码让用户手动复制！
   - 需要运行命令、拉取元数据、编译或检索时，必须直接调用 bash 工具执行，严禁贴出命令附带“请在终端按顺序执行”的呆板回复！
4. 【闭环验证与容错自愈 (Verify & Self-Heal)】：
   - 工具执行完后，必须检查 exitCode 与输出内容；
   - 若遇到错误，不要停滞或推卸给用户，而是自主分析原因，调整参数自动重试纠错，直至任务最终圆满完成；
   - 任务完成后，带着真实产生的文件路径、接口返回值或执行结果向用户汇报！`);

      // 若处于自动流程或审批流专家预设角色，全局优先注入《销售易流程实施视角规范》核心工程认知
      if (isAutoflowPreset || isApprovalPreset) {
        const perspectiveSkill = getProtectedSkillInstruction("skill-process-implementation-perspective");
        if (perspectiveSkill) {
          systemParts.push(`【全局首要植入规范：销售易流程实施工程认知与实操视角 (严格以「我」描述工程研判，先给结论与证据层级，四层模型解构，业务边界冻结)】\n${perspectiveSkill}`);
        }
      }

      if (presetPrompt) {
        if (presetPrompt.includes("[PROTECTED_PRESET::autoflow-architect]")) {
          const decodedPreset = getProtectedSkillInstruction("preset-autoflow-architect");
          if (decodedPreset) {
            systemParts.push(decodedPreset);
          }
        } else if (presetPrompt.includes("[PROTECTED_PRESET::approval-architect]")) {
          const decodedPreset = getProtectedSkillInstruction("preset-approval-architect");
          if (decodedPreset) {
            systemParts.push(decodedPreset);
          }
        } else if (presetPrompt.includes("[PROTECTED_PRESET::print-template-architect]")) {
          const decodedPreset = getProtectedSkillInstruction("preset-print-template-architect");
          if (decodedPreset) {
            systemParts.push(decodedPreset);
          }
        } else if (presetPrompt.includes("[PROTECTED_PRESET::fxiaoke-architect]")) {
          const decodedPreset = getProtectedSkillInstruction("preset-fxiaoke-architect");
          if (decodedPreset) {
            systemParts.push(decodedPreset);
          }
        } else if (presetPrompt.includes("[PROTECTED_PRESET::salesforce-architect]")) {
          const decodedPreset = getProtectedSkillInstruction("preset-salesforce-architect");
          if (decodedPreset) {
            systemParts.push(decodedPreset);
          }
        } else {
          systemParts.push(presetPrompt);
        }
      }

      if (config.settings.injectTenantContext && currentSession.isLoggedIn && currentSession.environment) {
        const env = currentSession.environment;
        const pType = env.productType || 'neocrm';
        const token = currentSession.tokenData;

        if (pType === 'salesforce') {
          const sfSkill = getProtectedSkillInstruction("skill-salesforce-cli");
          if (sfSkill) systemParts.push(sfSkill);

          systemParts.push(`【当前已连接的 CRM 平台与账号环境 - Salesforce】
- 目标平台: Salesforce (Force.com / Core CRM / 阿里中国版 & 全球版)
- 连接器名称: ${env.name} (${env.envType || '生产/沙盒'})
- 组织名称: ${token?.userInfo?.tenantName || 'Salesforce 组织'}
- 组织 ID (Org ID): ${token?.tenant_id || '00DC6000001CNBZMA4'}
- 认证用户: ${token?.userInfo?.name || 'Salesforce 用户'} (User ID: ${token?.userInfo?.userId || 'N/A'})
- 实例 URL: ${token?.instance_uri || env.neoBaseURL}
- 本地 CLI 会话状态: ✅ Connected (已实时同步至本地 sf CLI 工具链，CLI 别名: aliNewStageFull，凭据 100% 有效可用)
- 【极其重要 - 铁律】：
  当前环境已成功鉴权并连通 Salesforce 组织！本地 Salesforce CLI (sf) 的凭据已自动双向同步完成，状态为 Connected 有效就绪！
  绝对严禁向用户输出“凭据已过期”或要求用户在终端手动运行 \`sf org login web\` 命令！
  1. 当用户询问“查询租户有哪些对象”、“查询当前环境的对象信息”、“查看 SObjects 列表”、了解组织元数据时，必须立即自动调用 list_entities 工具向线上接口拉取组织内真实存在的 SObjects 列表！
  2. 当涉及具体对象的字段或结构时，必须自动调用 get_entity_fields 工具进行 Describe 探测，拉取真实字段定义（含自定义字段 __c）；
  3. 当需要拉取代码、元数据或 Apex 类时，必须自动调用 pull_crm_project_code 工具或使用本地已就绪的 sf CLI 执行同步，严禁推诿给用户去手动登录！
  4. 当需要查询数据记录时，必须自动调用 execute_sql_query 工具执行 SOQL 查询！`);
        } else if (pType === 'fxiaoke') {
          const fxSkill = getProtectedSkillInstruction("skill-fxiaoke-crm-cli");
          if (fxSkill) systemParts.push(fxSkill);

          systemParts.push(`【当前已连接的 CRM 平台与账号环境 - 纷享销客 (FXIAOKE)】
- 目标平台: 纷享销客 (FXIAOKE CRM / OpenAPI v2)
- 连接器名称: ${env.name}
- 所在云网关: ${env.cloudDomain || 'open.fxiaoke.com'}
- 自建应用: appId: ${env.clientId || '未配置'} · 企业账号 (ea): ${token?.userInfo?.ea || env.ea || token?.tenant_id || '833021_sandbox'}
- 授权状态: 客户端凭证模式已连通，Token 有效可用
- 【实时接口自动调用第一铁律】：
  当前工作台已通过 OpenAPI v2 真实连通纷享销客租户沙箱环境！
  1. 当用户提出“查询当前租户的对象信息”、“租户有哪些对象”、“查看对象列表/清单”或分析业务模型时，【绝对禁止仅凭预设知识列举概念或输出静态说明】，【必须第一时间自动调用 list_entities 工具】拉取当前租户线上真实的 150+ 个业务对象（如 MarketingEventObj, LeadsObj, AccountObj, ContactObj, ContractObj 等）！
  2. 当涉及具体对象的字段或状态时，必须第一时间自动调用 get_entity_fields 工具拉取 Describe 实时字段元数据与选项值，严禁臆造！
  3. 当需要查询数据记录时，必须自动调用 execute_sql_query 工具执行查询！
  拉取到真实接口数据后，必须基于线上真实返回的结果向用户进行汇报与分析！`);
        } else {
          systemParts.push(`【当前已连接的 CRM 平台与账号环境 - 销售易 (NeoCRM)】
- 目标平台: 销售易 (NeoCRM PaaS)
- 连接器名称: ${env.name} (${env.envType || '沙盒演练'})
- 租户名称: ${token?.userInfo?.tenantName || '未命名租户'} (租户 ID: ${token?.tenant_id || '未知'})
- 当前用户: ${token?.userInfo?.name || '未知用户'}
- 实例 BaseURL: ${token?.instance_uri || env.neoBaseURL || ''}
- 【实时接口自动调用铁律】：
  当前工作台已连通销售易租户。
  1. 当用户询问“查询租户有哪些对象”、“查询实体列表”、字段元数据或数据时，【必须第一时间自动调用 list_entities 工具】拉取租户真实实体列表，严禁凭空臆造！
  2. 当涉及具体实体字段时，必须先自动调用 get_entity_fields 工具核查真实字段元数据；
  3. 当需要查询业务数据时，必须自动调用 execute_sql_query 工具执行 XOQL 查询（遵循严禁 SELECT *，严禁 JOIN，支持点号穿透规范）。`);
        }
      }

      if (config.settings.customSystemPrompt?.trim()) {
        systemParts.push(`【用户自定义追加规范】\n${config.settings.customSystemPrompt.trim()}`);
      }

      // 注入已挂载的 Skill 技能指令 (仅允许用户个人专属技能动态挂载；系统内置技能受内核安全保护，禁止在普通对话中随意挂载)
      if (activeSkillIds && activeSkillIds.length > 0) {
        for (const sid of activeSkillIds) {
          // 仅激活用户个人自定义技能，内置系统技能禁止动态外挂
          const personal = (config.skills || []).find(
            (item) => item.id === sid && item.category === "personal" && item.enabled
          );
          if (personal && personal.systemInstruction?.trim()) {
            systemParts.push(`【已激活个人技能: ${personal.name}】\n${personal.systemInstruction.trim()}`);
          }
        }
      }

      // 注入已挂载的外部 MCP 扩展服务说明与引导
      if (activeCustomMcp.length > 0) {
        const mcpInfoText = activeCustomMcp
          .map((srv) => {
            const toolList = (srv.tools || []).map((t) => `${t.name}(${t.description || ""})`).join("; ");
            return `- 外部 MCP 服务 [${srv.name}] (${srv.type.toUpperCase()}): ${srv.description || ""} | 可用工具: [${toolList || "无"}]`;
          })
          .join("\n");

        systemParts.push(`【当前已连接并激活的外部 MCP 扩展服务 (Model Context Protocol)】
${mcpInfoText}
重要提示：当用户询问外部知识库、查看 MCP 知识库、检索外部文档或使用上述 MCP 扩展功能时，请务必优先主动调用上述外部 MCP 服务提供的工具（而不是查询销售易 CRM 实体对象表）！`);
      }

      // 注入历史对话压缩记忆
      if (compactionSummary?.summary) {
        systemParts.push(`【前期历史对话精简记忆摘要】\n${compactionSummary.summary}`);
      }

      // 2. 截取最近上下文消息
      const contextLimit = config.settings.contextLimit || 20;
      const recentMessages = messages.slice(-contextLimit);

      // 实时意图强引导：当已连接租户且用户请求查询对象、实体或字段时，注入最高优先级调具执行指令
      if (currentSession.isLoggedIn && currentSession.environment && config.settings.enableCrmTools !== false) {
        const env = currentSession.environment;
        const pType = env.productType || 'neocrm';
        const lastUserMsg = [...recentMessages].reverse().find((m) => m.role === 'user');
        const userContent = lastUserMsg?.content || '';

        // 1. 查询对象/实体意图
        const isAskingObjects =
          /(?:查询|获取|列出|查看|有哪些|显示).*(?:当前租户|租户|系统|环境|平台).*(?:对象|实体|元数据|model|entity|object)/i.test(userContent) ||
          /(?:查询|获取|列出|查看|有哪些|显示).*(?:对象|实体|元数据|表清单)/i.test(userContent) ||
          /\[\/(?:fx|sf|crm)\]\s*(?:查询|获取|列出|查看).*(?:对象|实体)/i.test(userContent);

        // 2. 字段校准、是否存在字段检验意图 (用户指正“字段名称有问题、有的可能不是name是别的”)
        const isAskingFields =
          /(?:查询|获取|列出|查看|describe).*(?:字段|属性|field|元数据)/i.test(userContent) ||
          /(?:是否存在字段|字段名称有问题|校准字段|核对字段|验证字段|真实字段|可能不是name|字段对不对|字段是什么)/i.test(userContent) ||
          /(?:检查|核对|校准|确认).*(?:对象|实体).*(?:字段|属性)/i.test(userContent);

        // 3. 模板设计与 Word (.docx) 文件生成意图
        const isAskingTemplateOrWord =
          /(?:生成|制作|设计|创建|导出|下载).*(?:模版|模板|word|docx)/i.test(userContent) ||
          /(?:模版|模板).*(?:生成|制作|设计|创建|word|docx)/i.test(userContent) ||
          userContent.includes('word文件') ||
          userContent.includes('Word文件') ||
          userContent.includes('打印模版') ||
          userContent.includes('打印模板');

        // 4. 脚本编写、真实执行与本地文件读写分析意图
        const isAskingScriptOrFileIO =
          /(?:生成脚本|写脚本|运行脚本|执行脚本|读取文件|分析文件|写文件|写入文件|检查文件|python脚本|bash脚本|自动化脚本)/i.test(userContent);

        if (isAskingObjects) {
          systemParts.push(`【系统实时调度指令 (优先级最高)】：检测到用户正在查询已连接环境（${env.name} · ${pType}）的实时对象/实体清单。根据当前平台规范，【你必须立即在首轮输出中自动调用 list_entities 工具向平台接口发起真实请求拉取数据】，严禁不调用工具直接静态回复！`);
        } else if (isAskingFields) {
          systemParts.push(`【系统实时调度指令 (最高优先级 - 必须调用工具核对真实字段！)】：
检测到用户正在质疑或要求核对业务对象的真实字段定义（如用户提示“字段名称有问题、可能不是 name 是别的”）。
【核心铁律 - 绝不凭记忆猜字段】：
1. 你必须立即在首轮输出中自动调用 get_entity_fields 或 get_print_template_fields 工具，向 CRM 平台发起真实接口请求获取对象的字段元数据！
2. 严禁凭记忆臆造字段，必须根据工具返回的真实字段（如销售易客户主名称是 accountName 而非 name，合同主名称是 title 而非 name，商机是 opportunityName，订单是 po，订单产品是 productName 等）向用户进行逐个对象的精确字段校准和对照汇报！`);
        }

        if (isAskingTemplateOrWord) {
          systemParts.push(`【系统实时调度指令 (最高执行优先级 - 必须先查字段再生成真实物理文件！)】：
检测到用户要求生成打印模板或 Word 文档（当前工作区路径: ${projectPath || '未指定'}）。
【核心执行铁律 - 绝不允许空谈 Markdown 文字！】：
1. 【第一步·真实字段校准】：你必须先自动调用 get_print_template_fields 或 get_entity_fields 工具，获取目标对象（如 order 订单）及关联明细子对象（如 orderProduct 订单产品、orderPayment 订单支付）在当前租户真实存在的字段 API Key，绝对禁止瞎猜臆造（严禁将客户名称写成 name，必须是 accountName；严禁将合同名称写成 name，必须是 title；严禁臆造不存在的 poStatus、paymentBalance 等）！
2. 【第二步·真实物理文件落盘】：校准字段后，你必须直接调用 generate_print_template 工具（传入 detailTables 包含全部产品明细、回款明细与审批流历史），在当前本地工作区生成符合销售易规范的真实 .docx 物理文件！严禁在 bash 命令行中手写容易报语法错误的 node -e 或手写代码去生成 docx，必须直接使用经过深度测试的 generate_print_template 原生工具完成物理文件生成！
3. 【第三步·任务清单全部标记为 completed】：生成物理文件并核验后，必须再次调用 todo_write 工具，将所有相关待办任务全部更新为 completed 状态，实现 100% 任务全部闭环！
3. 【反幻觉红线】：严禁在回答中空口声称“物理文件已通过 Python 脚本验证”、“已在本地生成物理文件：D:\\xxx.docx”等假动作！必须真实发起工具调用并在工具返回成功后，向用户汇报已落盘的文件名与绝对路径，生成的文件将实时出现在右侧项目文件与产物列表中供用户直接打开！`);
        }

        if (isAskingScriptOrFileIO) {
          systemParts.push(`【系统实时调度指令 (最高优先级 - 必须调用工具真实读写并运行！)】：
检测到用户要求生成脚本、运行脚本或读取文件进行分析。
【核心铁律】：
1. 若需分析本地文件，必须立即调用 read 工具读取真实文件内容，严禁空口假装读取！
2. 若需生成脚本，必须立即调用 write 工具将代码写入当前工作区物理文件（如 scripts/xxx.js 或 .py）！
3. 若需运行脚本或命令，必须立即调用 bash 工具真实执行该脚本，并基于捕获的真实 stdout/stderr 结果向用户汇报，严禁在正文中凭空虚构运行结果！`);
        }

        const isAskingPullCode =
          /(?:拉取|下载|同步|导出|获取).*(?:代码|后端|前端|元数据|工程|组件|脚本)/i.test(userContent) ||
          /(?:代码|后端|前端).*(?:拉取|下载|同步)/i.test(userContent) ||
          userContent.trim() === '拉取代码' ||
          userContent.trim() === '拉取后端前端代码';

        if (isAskingPullCode) {
          systemParts.push(`【系统实时调度指令 (最高优先级)】：检测到用户正在请求【拉取代码 / 拉取后端前端代码 / 同步本地工程】。当前本地工作区路径为: ${projectPath || '未指定'}。根据当前平台规范，【你必须立即在首轮输出中自动调用 pull_crm_project_code 工具执行真实接口数据拉取，并在本地项目目录实际创建文件与目录落盘】，绝不可仅在回答中以 Markdown 文本虚构假报告！`);
        }

        const isExecutionRequested =
          /(?:执行|开始|确认|自动执行|帮我跑|跑一下|运行|部署|拉取|同步).*(?:方案|命令|代码|脚本|步骤|manifest|retrieve|pull)/i.test(userContent) ||
          /(?:不能自动执行|为什么不自动执行|我都确认了|我已经确认|按方案|方式一|方式二|方案A|方案B|执行方案)/i.test(userContent) ||
          userContent.trim() === '执行' ||
          userContent.trim() === '确认' ||
          userContent.trim() === '开始执行' ||
          userContent.includes('不能自动执行吗');

        if (isExecutionRequested) {
          systemParts.push(`【系统实时调度指令 (最高执行优先级 - 立即自动执行！)】：
检测到用户已明确确认方案或要求自动执行命令（当前项目路径: ${projectPath || '未指定'}）。
【核心铁律 - 绝不可违背】：
1. 绝对严禁只输出 Markdown 格式的代码块并让用户“请在终端按顺序执行”！
2. 当前环境具备内置的 \`bash\` 命令行工具与 \`pull_crm_project_code\` 工具，本地 Salesforce CLI 已完全就绪且处于 Connected 鉴权有效状态！
3. 你必须在首轮输出中立即发起工具调用（优先调用 \`bash\` 工具执行指定命令，如在当前工程目录下创建目录、生成 manifest 或执行 sf project retrieve），等待工具返回执行结果，并在回复中直接向用户汇报真实的执行进度与落盘产物清单！`);
        }
      }

      const systemPromptText = systemParts.join('\n\n');
      const systemMessage = systemPromptText ? { role: 'system', content: systemPromptText } : null;

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
          enableTools: (enableTools !== false) && (config.settings.enableCrmTools || activeCustomMcp.length > 0),
          activeToolsSpec,
          activeCustomMcp,
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
          // 注入文件附件内容 (如 Excel 解析表格、代码文件等)
          if (msg.attachments && msg.attachments.length > 0) {
            const attachText = msg.attachments.map((a) => a.parsedContent).join('\n\n');
            text = `${attachText}\n\n${text}`;
          }
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

      // 5. 执行 Agent Loop（支持最多 8 轮连续工具迭代，保障复杂多步骤任务如 Todo对账、字段调研、模板生成、脚本执行全闭环）
      let loopCount = 0;
      const maxToolLoops = 8;
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
          requestBody.tools = activeToolsSpec;
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
              const res = await this.executeUnifiedTool(tc.name, args, activeCustomMcp, currentSession.environment, currentSession.tokenData, projectPath);
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
              content: this.formatSafeToolResultString(toolResult),
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
    activeToolsSpec?: any[];
    activeCustomMcp?: McpServerConfig[];
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
      activeToolsSpec = [],
      activeCustomMcp = [],
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

    // 转换全量激活工具为 Gemini functionDeclarations (带 JSON Schema 安全清理)
    const effectiveTools = activeToolsSpec && activeToolsSpec.length > 0 ? activeToolsSpec : CRM_HARNESS_TOOLS_SPEC;
    const geminiFunctionDeclarations = effectiveTools.map((spec) => {
      const fn = spec.function;
      const cleanedParams = cleanGeminiSchema(fn.parameters);
      const hasProps = cleanedParams?.properties && Object.keys(cleanedParams.properties).length > 0;
      return {
        name: fn.name,
        description: fn.description,
        ...(hasProps ? { parameters: cleanedParams } : {}),
      };
    });

    let loopCount = 0;
    const maxToolLoops = 8;
    const maxLoops = 9;
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
            const res = await this.executeUnifiedTool(
              fc.name,
              fc.args,
              activeCustomMcp,
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
                result: this.formatSafeToolResultObject(toolResult),
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
   * 同步外部 MCP 服务的可用工具列表 (tools/list)
   */
  public async syncMcpTools(serverId: string): Promise<{
    success: boolean;
    server?: McpServerConfig;
    tools?: McpToolItem[];
    error?: string;
  }> {
    const config = this.getAiConfig();
    const srv = (config.mcpServers || []).find((m) => m.id === serverId);
    if (!srv) {
      return { success: false, error: "未找到指定的 MCP 服务" };
    }
    if (srv.type === "builtin" || srv.id === "neocrm-paas-mcp") {
      return { success: true, server: srv, tools: [] };
    }

    const res = await this.mcpClientService.discoverTools(srv);
    if (!res.success || !res.tools) {
      return { success: false, error: res.error || "探测 MCP 工具失败" };
    }

    srv.tools = res.tools;
    this.saveMcpServer(srv);
    return {
      success: true,
      server: srv,
      tools: res.tools,
    };
  }

  /**
   * 统一工具调用调度器 (自动分发到销售易本地内核工具或外部 MCP 服务)
   */
  private async executeUnifiedTool(
    name: string,
    args: any,
    activeMcpServers: McpServerConfig[],
    env?: NeoEnvironment,
    tokenData?: TokenData,
    projectPath?: string
  ): Promise<{ data: any; summary: string }> {
    // 1. 判断是否为销售易本地 Harness 工具
    const isCrmTool = CRM_HARNESS_TOOLS_SPEC.some((s) => s.function.name === name);
    if (isCrmTool) {
      return await this.executeCrmTool(name, args, env, tokenData, projectPath);
    }

    // 2. 匹配外部 MCP 服务
    let targetServer = activeMcpServers.find((s) => s.tools?.some((t) => t.name === name));
    if (!targetServer) {
      targetServer = activeMcpServers.find((s) =>
        name.toLowerCase().includes(s.name.toLowerCase().replace(/[^a-z0-9]/g, ""))
      ) || (activeMcpServers.length === 1 ? activeMcpServers[0] : undefined);
    }

    if (!targetServer) {
      throw new Error(`未找到能够处理工具 [${name}] 的 MCP 服务或本地驱动`);
    }

    const res = await this.mcpClientService.callTool(targetServer, name, args);
    if (!res.success) {
      throw new Error(res.error || res.summary || `调用 MCP 工具 ${name} 失败`);
    }

    return {
      data: res.data,
      summary: res.summary || `成功执行 MCP 工具: ${name}`,
    };
  }

  /**
   * 执行销售易本地 Harness 工具
   */
  /**
   * 上下文 Token 安全守护：防御性截断工具调用返回的大文本/日志，彻底避免 1M Token 上下文溢出报错
   */
  private formatSafeToolResultString(toolResult: any, maxChars = 25000): string {
    if (!toolResult) return '{}';
    try {
      let str = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
      if (str.length <= maxChars) return str;

      if (typeof toolResult === 'object' && toolResult !== null) {
        const copy = { ...toolResult };
        if (typeof copy.stdout === 'string' && copy.stdout.length > 15000) {
          copy.stdout = copy.stdout.slice(-15000) + '... [已截断前序日志]';
        }
        if (typeof copy.stderr === 'string' && copy.stderr.length > 5000) {
          copy.stderr = copy.stderr.slice(-5000);
        }
        const reStr = JSON.stringify(copy);
        if (reStr.length <= maxChars) return reStr;
        return reStr.slice(0, maxChars - 100) + '... [结果已安全截断]"}';
      }

      return str.slice(0, maxChars - 100) + '... [输出过大已截断]';
    } catch {
      return String(toolResult).slice(0, maxChars);
    }
  }

  private formatSafeToolResultObject(toolResult: any, maxChars = 25000): any {
    if (!toolResult || typeof toolResult !== 'object') return toolResult;
    try {
      const copy = { ...toolResult };
      if (typeof copy.stdout === 'string' && copy.stdout.length > 15000) {
        copy.stdout = copy.stdout.slice(-15000) + '... [已截断前序日志]';
      }
      if (typeof copy.stderr === 'string' && copy.stderr.length > 5000) {
        copy.stderr = copy.stderr.slice(-5000);
      }
      return copy;
    } catch {
      return toolResult;
    }
  }

  private async executeCrmTool(
    name: string,
    args: any,
    env?: NeoEnvironment,
    tokenData?: TokenData,
    projectPath?: string
  ): Promise<{ data: any; summary: string }> {
    // ================= DeepSeek Harness 原生工具分发 (无需 CRM 登录) =================
    if (name === "bash") {
      const res = await this.dshToolService.executeBash({
        ...args,
        workdir: args.workdir || projectPath,
      });
      return {
        data: res,
        summary: `执行 Bash: ${args.command.slice(0, 45)}${args.command.length > 45 ? "..." : ""} (Exit: ${res.exitCode})`,
      };
    }

    if (name === "read") {
      const res = this.dshToolService.readFile(args);
      return {
        data: res,
        summary: `读取文件 [${path.basename(res.path)}]: 返回 ${res.content.split('\n').length} 行`,
      };
    }

    if (name === "write") {
      const res = this.dshToolService.writeFile(args);
      return {
        data: res,
        summary: `写入文件 [${path.basename(res.path)}]: ${res.bytesWritten} 字节, ${res.linesCount} 行`,
      };
    }

    if (name === "edit") {
      const res = this.dshToolService.editFile(args);
      return {
        data: res,
        summary: `编辑文件 [${path.basename(res.path)}]: 替换 ${res.replacedOccurrences} 处文本`,
      };
    }

    if (name === "str_replace_editor") {
      const res = this.dshToolService.strReplaceEditor(args);
      return {
        data: res,
        summary: `行级编辑器 [${args.command}]: ${path.basename(args.path)}`,
      };
    }

    if (name === "read_image") {
      const res = this.dshToolService.readImage(args);
      return {
        data: res,
        summary: `检查图片 [${path.basename(res.path)}]: ${res.sizeBytes} 字节 (${res.mimeType})`,
      };
    }

    if (name === "glob") {
      const res = this.dshToolService.globSearch(args);
      return {
        data: res,
        summary: `Glob 检索【${args.pattern}】: 命中 ${res.count} 个文件`,
      };
    }

    if (name === "grep") {
      const res = this.dshToolService.grepSearch(args);
      return {
        data: res,
        summary: `Grep 检索【${args.pattern}】: 命中 ${res.totalMatches} 处`,
      };
    }

    if (name === "web_search") {
      const res = await this.dshToolService.webSearch(args);
      return {
        data: res,
        summary: `Web 搜索完成: 发现 ${res.totalResults} 条来源与摘要`,
      };
    }

    if (name === "web_fetch") {
      const res = await this.dshToolService.webFetch(args);
      return {
        data: res,
        summary: `Web 抓取成功: ${res.title || res.url} (${res.markdownContent.length} 字符)`,
      };
    }

    if (name === "todo_write") {
      const res = this.dshToolService.writeTodos(args);
      return {
        data: res,
        summary: `更新任务清单: 共 ${res.todos.length} 项 (进行中: ${res.counts.inProgress}, 完成: ${res.counts.completed})`,
      };
    }

    if (name === "get_goal") {
      const res = this.dshToolService.getGoal();
      return {
        data: res,
        summary: res.hasGoal ? `当前目标: ${res.goal?.objective} (${res.goal?.status})` : `当前会话未设定目标`,
      };
    }

    if (name === "create_goal") {
      const res = this.dshToolService.createGoal(args);
      return {
        data: res,
        summary: `确立任务目标: ${res.objective}${res.token_budget ? ` (预算: ${res.token_budget})` : ''}`,
      };
    }

    if (name === "update_goal") {
      const res = this.dshToolService.updateGoal(args);
      return {
        data: res,
        summary: `更新目标状态为: ${res.status}`,
      };
    }

    if (name === "ask_user_question") {
      const res = this.dshToolService.askUserQuestion(args);
      return {
        data: res,
        summary: `向用户发起确认: ${res.question} (${res.options.length} 个选项)`,
      };
    }

    // ================= 销售易租户专属工具 (需要 CRM 登录) =================
    if (!env || !tokenData) {
      throw new Error('当前未登录 CRM 租户/环境，无法访问元数据或数据接口');
    }

    if (name === 'get_tenant_info') {
      const pType = env.productType || 'neocrm';
      const info: Record<string, any> = {
        productType: pType,
        envName: env.name,
        envType: env.envType || (pType === 'fxiaoke' ? '沙箱环境' : '生产/沙盒'),
        instanceUri: tokenData.instance_uri || env.neoBaseURL,
        tenantId: tokenData.tenant_id,
        tenantName: tokenData.userInfo?.tenantName || env.name,
        userName: tokenData.userInfo?.name,
      };
      if (pType === 'fxiaoke') {
        info.ea = tokenData.userInfo?.ea || env.ea || tokenData.tenant_id;
        info.appId = env.clientId;
        info.cloudDomain = env.cloudDomain || 'open.fxiaoke.com';
      }
      return {
        data: info,
        summary: `成功读取当前已连接的 ${pType} 租户: ${info.tenantName || info.ea} (${info.envName})`,
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
        pickOptions: f.pickOption?.map((p) => `${p.optionCode}:${p.optionLabel}`).slice(0, 15),
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

    if (name === "pull_crm_project_code") {
      const targetDir = args.targetDir || projectPath;
      if (!targetDir) {
        throw new Error("请先在右侧打开或指定一个本地项目工作区目录，以便将拉取的代码与元数据写入本地");
      }
      const res = await this.codeSyncService.pullProjectCode(env, tokenData, {
        targetDir,
        pullType: args.pullType || 'all',
        entityNames: args.entityNames,
      });
      return {
        data: res,
        summary: `成功拉取线上代码与元数据到本地工作区 [${path.basename(targetDir)}]: 共生成/更新 ${res.createdFilesCount} 个文件`,
      };
    }

    if (name === "execute_sql_query") {
      const rawInput = (args.sql || args.query || args.xoql || "").trim();
      if (!rawInput) throw new Error("缺少 sql 查询语句参数");

      if (env.productType === 'fxiaoke') {
        const sql = rawInput.replace(/^```(?:sql)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const queryRes = await this.dataService.executeQuery(env, tokenData, sql);
        if (!queryRes.success || !queryRes.data) {
          const rawErr = queryRes.error || "SQL 执行返回失败";
          throw new Error(`纷享销客数据查询失败: ${rawErr} (提示: 纷享销客对象以 Obj 结尾，如 AccountObj、ContactObj、ContractObj，单页上限 50 条，LIMIT 50 OFFSET n；若不确定字段请先调用 get_entity_fields 确认真实字段)`);
        }
        const records = queryRes.data.records || [];
        const fields = queryRes.data.fields || (records.length > 0 ? Object.keys(records[0]) : []);
        return {
          data: {
            records: records.slice(0, 50),
            totalSize: queryRes.data.totalSize ?? records.length,
            fields,
          },
          summary: `纷享销客查询成功，返回 ${records.length} 条数据 (总计: ${queryRes.data.totalSize ?? records.length})`,
        };
      }

      if (env.productType === 'salesforce') {
        const sql = rawInput.replace(/^```(?:sql|soql)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const queryRes = await this.dataService.executeQuery(env, tokenData, sql);
        if (!queryRes.success || !queryRes.data) {
          const rawErr = queryRes.error || "SOQL 执行返回失败";
          throw new Error(`Salesforce SOQL 执行失败: ${rawErr} (提示: 标准对象如 Account, Contact, Opportunity，自定义对象以 __c 结尾；若不确定字段请先调用 get_entity_fields 确认真实字段)`);
        }
        const records = queryRes.data.records || [];
        const fields = queryRes.data.fields || (records.length > 0 ? Object.keys(records[0]) : []);
        return {
          data: {
            records: records.slice(0, 50),
            totalSize: queryRes.data.totalSize ?? records.length,
            fields,
          },
          summary: `Salesforce SOQL 执行成功，返回 ${records.length} 条数据 (总计: ${queryRes.data.totalSize ?? records.length})`,
        };
      }

      const { sql: sanitized, rejectReason } = this.dataService.sanitizeAndRewriteXoql(rawInput);
      if (rejectReason) {
        throw new Error(rejectReason);
      }
      let sql = sanitized;
      const isPureCount = /^SELECT\s+(?:COUNT|SUM|AVG|MAX|MIN)\s*\([^)]+\)\s*(?:AS\s+\w+\s*)?FROM\b/i.test(sql) && !/\bGROUP\s+BY\b/i.test(sql);
      if (!/\bLIMIT\s+\d+/i.test(sql) && !isPureCount) {
        sql = `${sql.replace(/;+$/, "").trim()} LIMIT 30`;
      }
      const queryRes = await this.dataService.executeQuery(env, tokenData, sql);
      if (!queryRes.success || !queryRes.data) {
        const rawErr = queryRes.error || "SQL 执行返回失败";
        throw new Error(`${rawErr} (提示: 销售易标准对象主名称字段分别为 account->accountName、contact->contactName、opportunity->opportunityName、order->po、contract->title、product->productName、department->departName、自定义对象(*__c)->name；若不确定字段请先调用 get_entity_fields 确认真实字段 API Key)`);
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

    if (name === "get_approval_resources") {
      const res = await this.workflowService.getApprovalResources(env, tokenData, args.entityApiKey);
      return {
        data: res,
        summary: `成功查询租户审批资源: 包含 ${res.roles.length} 个角色, ${res.departments.length} 个部门, ${res.users.length} 个用户${res.busiTypes.length > 0 ? `, ${res.busiTypes.length} 个业务类型` : ""}`,
      };
    }

    if (name === "list_flows") {
      licenseService.assertAuthorized();
      const res = await this.workflowService.listTenantFlows(env, tokenData, {
        procType: args.procType,
        keyword: args.keyword,
      });
      const flows = res.data || [];
      const ptLabel = args.procType === 1 ? "自动流程" : args.procType === 2 ? "审批流" : "流程";
      const totalInTenant = res.totalInTenant !== undefined ? res.totalInTenant : flows.length;

      let summary = "";
      if (args.keyword) {
        if (flows.length > 0) {
          summary = `按关键词【${args.keyword}】检索到 ${flows.length} 条${ptLabel} (租户总计 ${totalInTenant} 条)`;
        } else {
          summary = `关键词【${args.keyword}】下暂无现有${ptLabel} (租户共存在 ${totalInTenant} 条其他对象的流程资产)`;
        }
      } else {
        summary = `检索到当前租户共 ${flows.length} 条${ptLabel}资产`;
      }

      return {
        data: {
          totalCount: flows.length,
          matchedKeyword: args.keyword || null,
          tenantTotalCount: totalInTenant,
          flows: flows.map((f) => ({
            id: f.id,
            procdefId: f.procdefId,
            name: f.name,
            objectName: f.objectName,
            entityApiKey: f.entityApiKey,
            status: f.statusName,
            procType: f.procType === 1 ? "自动流程 (Automatic Flow)" : "审批流 (Approval Flow)",
            updatedAt: f.updatedAt,
            description: f.description,
          })),
          tenantOtherFlowsSample: flows.length === 0 && res.allFlowsSummary ? res.allFlowsSummary.slice(0, 10) : undefined,
          guidance: flows.length === 0 && args.keyword
            ? `当前租户在【${args.keyword}】对象下未配置历史${ptLabel}（当前租户在其他对象下共存在 ${totalInTenant} 条流程资产）。这意味着该对象无旧流程冲突，可作为该对象的第 1 个新流直接部署。` : undefined,
        },
        summary,
      };
    }

    if (name === "get_flow_detail") {
      licenseService.assertAuthorized();
      const pt = args.procType === 2 ? 2 : 1;
      const res = await this.workflowService.getFlowDetail(env, tokenData, args.procdefId, pt);
      if (!res.success) throw new Error(res.error || "获取流程定义详情失败");
      return {
        data: {
          procdefId: args.procdefId,
          procType: pt === 1 ? "自动流程" : "审批流",
          baseInfo: res.definition?.baseInfo,
          nodesCount: Object.keys(res.definition?.nodeInfo || {}).length,
          nodes: Object.entries(res.definition?.nodeInfo || {}).map(([key, n]: any) => ({
            id: key,
            name: n.taskDefName || n.label,
            type: n.nodeType,
          })),
          businessConfig: {
            gateWays: res.definition?.businessConfig?.gateWays,
            actions: res.definition?.businessConfig?.actions,
            usertasks: res.definition?.businessConfig?.usertasks,
            submittask: res.definition?.businessConfig?.submittask,
            resourceConfig: res.definition?.businessConfig?.resourceConfig,
          },
        },
        summary: `成功读取 ${pt === 1 ? "自动流程" : "审批流"} (${args.procdefId}) 完整拓扑`,
      };
    }

    if (name === "list_autoflows") {
      licenseService.assertAuthorized();
      const res = await this.workflowService.listAutoFlows(env, tokenData, { keyword: args.keyword });
      if (!res.success) throw new Error(res.error || "获取自动流程失败");
      const list = res.data?.rows || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      const summaryList = list.slice(0, 30).map((f: any) => ({
        procdefId: f.procdefId || f.id,
        processName: f.processName || f.name,
        actKey: f.actKey || f.apiKey,
        entityApiKey: f.entityApiKey,
        status: f.status === 1 ? "启用" : f.status === 2 ? "禁用" : "设计态草稿",
        executeType: f.executeType,
      }));
      return {
        data: {
          totalCount: list.length,
          flows: summaryList,
        },
        summary: `检索到当前租户 ${list.length} 条自动流程`,
      };
    }

    if (name === "inspect_autoflow") {
      licenseService.assertAuthorized();
      const res = await this.workflowService.getFlowDetail(env, tokenData, args.procdefId);
      if (!res.success) throw new Error(res.error || "获取流程定义失败");
      return {
        data: {
          procdefId: args.procdefId,
          baseInfo: res.definition?.baseInfo,
          nodesCount: Object.keys(res.definition?.nodeInfo || {}).length,
          nodes: Object.values(res.definition?.nodeInfo || {}).map((n: any) => ({
            id: n.taskDefName,
            name: n.label,
            type: n.nodeType,
          })),
          resourceConfig: res.definition?.businessConfig?.resourceConfig,
        },
        summary: `成功读取自动流程 (${args.procdefId}) 图模型详情`,
      };
    }

    if (name === "generate_print_template") {
      const res = await this.printTemplateService.generatePrintTemplate({
        ...args,
        workdir: args.workdir || projectPath,
      });
      if (!res.success) throw new Error(res.error || res.message || "生成打印模板失败");
      return {
        data: res,
        summary: res.message,
      };
    }

    if (name === "list_print_objects") {
      const res = await this.printTemplateService.listPrintObjects(env, tokenData);
      if (!res.success) throw new Error(res.error || "获取打印对象列表失败");
      const list = res.data || [];
      const configured = list.filter((o) => o.allNum > 0);
      return {
        data: {
          totalObjects: list.length,
          configuredObjectsCount: configured.length,
          configuredObjects: configured.map((o) => ({
            objectId: o.objectId,
            apiKey: o.apiKey,
            label: o.label,
            totalTemplates: o.allNum,
            enabledTemplates: o.enableNum,
            wordModelUrl: o.wordModelUrl,
            excelModelUrl: o.excelModelUrl,
          })),
          allObjectsSample: list.slice(0, 30).map((o) => ({
            objectId: o.objectId,
            apiKey: o.apiKey,
            label: o.label,
            totalTemplates: o.allNum,
            enabledTemplates: o.enableNum,
          })),
        },
        summary: `检索到支持打印模板的业务对象 ${list.length} 个 (其中 ${configured.length} 个对象已配置模板)`,
      };
    }

    if (name === "list_print_templates") {
      const res = await this.printTemplateService.listTemplatesByObject(env, tokenData, {
        entityApiKey: args.entityApiKey,
        objectId: args.objectId,
      });
      if (!res.success) throw new Error(res.error || "获取打印模板列表失败");
      const list = res.data || [];
      return {
        data: {
          objectId: res.objectId,
          entityApiKey: res.entityApiKey,
          objectLabel: res.objectLabel,
          totalCount: res.total,
          templates: list.map((t: any) => ({
            id: t.id,
            name: t.name,
            status: t.statusName,
            outputType: t.outputTypeName,
            fileName: t.fileName,
            fileUrl: t.fileUrl,
            hasCondition: t.hasCondition,
            updatedAt: t.updatedAt,
          })),
        },
        summary: `检索到【${res.objectLabel || res.entityApiKey || "目标对象"}】已配置 ${list.length} 个打印模板`,
      };
    }

    if (name === "get_print_template_fields") {
      const res = await this.printTemplateService.getPrintTemplateFields(env, tokenData, {
        entityApiKey: args.entityApiKey,
        objectId: args.objectId,
      });
      if (!res.success) throw new Error(res.error || "获取打印可用字段失败");
      const d = res.data!;
      return {
        data: {
          objectId: d.objectId,
          entityApiKey: d.entityApiKey,
          objectLabel: d.objectLabel,
          mainFieldsCount: d.mainFields.length,
          mainFieldsSample: d.mainFields.slice(0, 40),
          allMainFields: d.mainFields,
          childLinksCount: d.childLinks.length,
          childLinks: d.childLinks,
          functionFields: d.functionFields,
        },
        summary: `查询【${d.objectLabel} (${d.entityApiKey})】打印字段: 主字段 ${d.mainFields.length} 个, 关联明细对象 ${d.childLinks.length} 个`,
      };
    }

    if (name === "download_template_sample") {
      const res = await this.printTemplateService.downloadTemplateSample(env, tokenData, {
        entityApiKey: args.entityApiKey,
        objectId: args.objectId,
      });
      if (!res.success) throw new Error(res.error || "获取模板范例链接失败");
      return {
        data: res.data,
        summary: `成功获取【${res.data?.objectLabel} (${res.data?.entityApiKey})】官方标准 Word/Excel 模板范例下载链接`,
      };
    }

    if (name === "toggle_print_template_status") {
      const res = await this.printTemplateService.toggleTemplateStatus(env, tokenData, args.templatePrintId, args.enable);
      if (!res.success) throw new Error(res.error || "切换模板状态失败");
      return {
        data: res,
        summary: `成功${args.enable ? "启用" : "禁用"}打印模板 (${args.templatePrintId})`,
      };
    }

    if (name === "render_print_preview") {
      const res = await this.printTemplateService.renderPrintDocument(env, tokenData, {
        entityApiKey: args.entityApiKey,
        recordId: args.recordId,
        templateId: args.templateId,
        exportType: args.exportType,
      });
      if (!res.success) throw new Error(res.error || "生成打印预览失败");
      return {
        data: {
          exportType: res.data?.exportType,
          hasBase64: Boolean(res.data?.base64),
          fileUrl: res.data?.fileUrl,
          fileName: res.data?.fileName,
        },
        summary: `成功调用打印运行接口生成预览 (格式: ${res.data?.exportType === 2 ? "Word" : res.data?.exportType === 3 ? "Excel" : "PDF"})`,
      };
    }

    throw new Error(`未知工具名称: ${name}`);
  }
}
