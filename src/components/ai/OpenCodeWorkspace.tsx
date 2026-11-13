import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code2, MessageSquareText, X } from 'lucide-react';
import { AI_AGENT_PRESETS, DEFAULT_AI_SETTINGS } from '../../../shared/constants';
import { requiresRoleLicense } from '../../../shared/licensePolicy';
import type { AiChatMessage, AiChatSession, AiConfigData, AiFileAttachment, AiProviderConfig, AiStreamEvent, SessionState, WorkspaceProject } from '../../../shared/types';
import type { WorkspaceDataSources } from '../../../shared/workspaceTypes';
import { useRestrictedFeatures } from '../../security/RestrictedFeatures';
import { OpenCodeStream } from './openCodeStream';
import { pendingQuestion } from './openCodeQuestion';
import { prepareSvgDiagram } from './svgDiagram';

const WorkspaceCodeEditor = lazy(() => import('./WorkspaceCodeEditor'));

const SERVER_URL = 'http://neocrm.local';
const SERVER_KEY = btoa(SERVER_URL).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const DEFAULT_AGENT = 'harness-agent';
const LEGACY_DURATION_LIMIT_MS = 2 * 60 * 60 * 1000;
const IMAGE_FILE_PATTERN = /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
};

interface OpenCodeWorkspaceProps {
  currentSession?: SessionState;
  activeProject?: WorkspaceProject;
  activeSessionId?: string | null;
  sessions: AiChatSession[];
  onSelectSession: (id: string | null) => void;
  onSessionsChange: (sessions: AiChatSession[]) => void;
  selectedPresetId: string;
  onSelectPreset: (id: string) => void;
  workflowLicenseStatus?: { isAuthorized?: boolean } | null;
  onEditProject?: (project: WorkspaceProject) => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

type BridgeRequest = {
  type: 'neo-opencode-rpc';
  url: string;
  method: string;
  body?: string;
  bodyBase64?: string;
};

type ClipboardBridgeRequest = { type: 'neo-opencode-clipboard-write'; text: string };
type ProjectActionBridgeRequest = { type: 'neo-opencode-project-action'; action: 'open' | 'edit'; directory: string };
type RevealBridgeRequest = { type: 'neo-opencode-reveal-path'; directory: string };

type BridgeEvent = {
  id: string;
  created: number;
  type: string;
  location?: { directory: string };
  data: Record<string, unknown>;
};

const idToOpenCode = (id: string) => id.startsWith('sess_') ? `ses_${id.slice(5)}` : id;
const idFromOpenCode = (id: string) => id.startsWith('ses_') ? `sess_${id.slice(4)}` : id;
const messageId = (prefix: 'msg_u_' | 'msg_a_' = 'msg_a_') => `${prefix}${crypto.randomUUID()}`;
const eventId = () => `evt_${crypto.randomUUID()}`;

function utf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function jsonResponse(port: MessagePort, value: unknown, status = 200) {
  port.postMessage({ kind: 'response', status, headers: [['content-type', 'application/json']], body: [204, 205, 304].includes(status) ? undefined : JSON.stringify(value) });
  port.close();
}

function errorResponse(port: MessagePort, message: string, status = 400) {
  jsonResponse(port, { name: 'NeoCRMCompatibilityError', message }, status);
}

function bytesToBase64(value: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < value.length; offset += 0x8000) binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) result[index] = binary.charCodeAt(index);
  return result;
}

function imageReference(value: string) {
  const target = value.trim();
  const path = target.startsWith('<') && target.endsWith('>') ? target.slice(1, -1) : target;
  const plain = path.replace(/[?#].*$/, '');
  if (!plain || !IMAGE_FILE_PATTERN.test(plain) || /^(?:[a-z][a-z\d+.-]*:|[/\\])/i.test(plain)) return undefined;
  if (plain.replaceAll('\\', '/').split('/').some(part => part === '..')) return undefined;
  return { target, path: plain };
}

/** Add visual previews to the OpenCode projection without changing persisted model text. */
function withLocalImagePreviews(markdown: string) {
  if (!markdown) return markdown;
  const seen = new Set<string>();
  for (const match of markdown.matchAll(/!\[[^\]\n]*\]\((<[^>\n]+>|[^)\s\n]+)\)/g)) {
    const reference = imageReference(match[1]);
    if (reference) seen.add(reference.path);
  }
  const output: string[] = [];
  const lines = markdown.split('\n');
  let fence: { marker: string; language: string; body: string[] } | undefined;

  for (const line of lines) {
    const opening = !fence && line.match(/^\s*(`{3,}|~{3,})\s*([\w#+.-]*)\s*$/);
    if (opening) {
      fence = { marker: opening[1], language: opening[2].toLowerCase(), body: [] };
      output.push(line);
      continue;
    }
    if (fence) {
      output.push(line);
      if (new RegExp(`^\\s*${fence.marker[0]}{${fence.marker.length},}\\s*$`).test(line)) {
        if (fence.language === 'diagram') {
          const reference = imageReference(fence.body.join('\n').trim());
          if (reference && !seen.has(reference.path)) {
            seen.add(reference.path);
            output.push('', `![${reference.path.split('/').at(-1) || '图片'}](${reference.target})`);
          }
        }
        fence = undefined;
      } else fence.body.push(line);
      continue;
    }

    const previews: string[] = [];
    const decorated = line.replace(/(!?)\[([^\]\n]*)\]\((<[^>\n]+>|[^)\s\n]+)\)/g, (full, image: string, label: string, target: string) => {
      const reference = imageReference(target);
      if (!reference) return full;
      if (image) {
        seen.add(reference.path);
        return full;
      }
      if (!seen.has(reference.path)) {
        seen.add(reference.path);
        previews.push(`![${label || reference.path.split('/').at(-1) || '图片'}](${reference.target})`);
      }
      return full;
    });
    output.push(decorated);
    if (previews.length) output.push('', ...previews);
  }
  return output.join('\n');
}

function imageBytes(dataUrl: string, expectedType: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,([a-z\d+/=\s]+)$/i);
  if (!match || match[1].toLowerCase() !== expectedType) throw new Error('图片预览返回了无效的数据格式');
  return base64ToBytes(match[2].replace(/\s/g, ''));
}

function relativeWorkspacePath(value: string) {
  const normalized = String(value || '').replaceAll('\\', '/').trim();
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) throw new Error('OpenCode 只能访问项目根目录内的相对路径');
  const parts = normalized.split('/').filter(part => part && part !== '.');
  if (parts.some(part => part === '..')) throw new Error('项目路径不能包含 ..');
  return parts.join('/');
}

const workspaceFilePath = (root: string, relative: string) => `${root.replace(/[\\/]+$/g, '')}/${relative}`;

function countUsage(session: AiChatSession) {
  const result = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };
  for (const message of session.messages || []) {
    const usage = message.usage;
    if (!usage) continue;
    result.input += usage.promptTokens || 0;
    result.output += usage.completionTokens || 0;
  }
  return result;
}

function sessionCost(session: AiChatSession) {
  return (session.messages || []).reduce((total, message) => total + (message.usage?.estimatedCostUsd || 0), 0);
}

function modelRef(session: Pick<AiChatSession, 'providerId' | 'modelId'>) {
  return { providerID: session.providerId || 'neocrm', id: session.modelId || 'default' };
}

function projectLocation(project?: WorkspaceProject) {
  return { directory: project?.localPath || '' };
}

function completedAt(message: AiChatMessage) {
  const duration = message.durationMs;
  if (duration === undefined || !Number.isFinite(duration) || duration < 0) return undefined;
  // Older records used wall-clock subtraction and could include time spent asleep or suspended.
  if (message.durationSource !== 'monotonic' && duration > LEGACY_DURATION_LIMIT_MS) return undefined;
  return message.createdAt + duration;
}

function toSessionInfo(session: AiChatSession, project?: WorkspaceProject) {
  const usage = countUsage(session);
  const directory = project?.localPath || '';
  return {
    id: idToOpenCode(session.id),
    ...((session.agentRun?.parentSessionId || session.fork?.sessionId)
      ? { parentID: idToOpenCode(session.fork?.sessionId || session.agentRun!.parentSessionId!) } : {}),
    ...(session.fork ? { fork: { sessionID: idToOpenCode(session.fork.sessionId), boundary: session.fork.boundary } } : {}),
    projectID: session.projectId || project?.id || 'global',
    agent: session.presetId || DEFAULT_AGENT,
    model: modelRef(session),
    cost: sessionCost(session),
    tokens: usage,
    time: { created: session.createdAt, updated: session.updatedAt, ...(session.agentRun?.status === 'running' ? { busy: session.agentRun.startedAt || session.updatedAt } : {}) },
    title: session.title,
    ...(session.revert ? { revert: { messageID: session.revert.messageID, files: [] } } : {}),
    location: { directory },
  };
}

function toMessage(message: AiChatMessage, session: AiChatSession, streaming = false) {
  const base = { id: message.id.startsWith('msg_') ? message.id : `msg_${message.id}`, time: { created: message.createdAt } };
  if (message.role === 'user') {
    return {
      ...base,
      type: 'user',
      text: message.content,
      files: (message.attachments || []).map(file => ({
        data: file.openCodeFile ? '' : file.parsedContent ? utf8Base64(file.parsedContent.slice(0, 128 * 1024)) : '',
        mime: file.mimeType || 'text/plain',
        source: { type: 'uri', uri: file.openCodeFile?.uri || file.relativePath || file.name },
        name: file.name,
        description: file.openCodeFile?.description || file.summaryText || '',
        ...(file.openCodeFile?.mention ? { mention: file.openCodeFile.mention } : {}),
      })),
      agents: [],
      skills: (message.skillIds || []).map(id => ({ id, name: id })),
    };
  }
  if (message.role === 'assistant') {
    const content: any[] = [];
    const completed = completedAt(message);
    if (message.reasoningContent) content.push({ type: 'reasoning', text: message.reasoningContent, time: { created: message.createdAt, ...(message.isThinkingFinished ? { completed: message.createdAt + (message.reasoningDurationMs || 0) } : {}) } });
    if (message.content) content.push({ type: 'text', text: streaming ? message.content : withLocalImagePreviews(message.content) });
    for (const call of message.toolCalls || []) {
      const input = call.arguments || {};
      const resultText = typeof call.resultSummary === 'string' && call.resultSummary ? call.resultSummary : call.error || '工具执行完成';
      content.push({
        type: 'tool', id: call.id, name: call.name === 'todo_write' ? 'todowrite' : call.name, executed: call.status !== 'running',
        time: { created: message.createdAt, ...(call.durationMs ? { ran: message.createdAt, completed: message.createdAt + call.durationMs } : {}) },
        state: call.status === 'running'
          ? { status: 'running', input, metadata: {} }
          : call.status === 'error'
            ? { status: 'error', input, error: { type: 'tool', message: call.error || resultText }, content: [{ type: 'text', text: resultText }] }
            : { status: 'completed', input, content: [{ type: 'text', text: resultText }], metadata: {} },
      });
    }
    if (!content.length && message.error) content.push({ type: 'text', text: message.error });
    return {
      ...base,
      type: 'assistant',
      agent: session.presetId || DEFAULT_AGENT,
      model: modelRef({ providerId: message.providerId || session.providerId, modelId: message.modelId || session.modelId }),
      content,
      time: { created: message.createdAt, ...(completed !== undefined ? { completed } : {}) },
      finish: message.error ? 'error' : streaming ? undefined : 'stop',
      tokens: message.usage ? { input: message.usage.promptTokens || 0, output: message.usage.completionTokens || 0, reasoning: 0, cache: { read: 0, write: 0 } } : undefined,
      cost: message.usage?.estimatedCostUsd || 0,
      error: message.error ? { type: 'error', message: message.error } : undefined,
    };
  }
  return { ...base, type: 'system', text: message.content, description: 'NeoCRM message' };
}

function visibleSessionMessages(session: AiChatSession) {
  if (!session.revert?.messageID) return session.messages || [];
  const boundary = session.messages.findIndex(message => message.id === session.revert?.messageID);
  return boundary < 0 ? session.messages || [] : session.messages.slice(0, boundary);
}

function modelInfo(provider: AiProviderConfig, model: AiProviderConfig['models'][number]) {
  return {
    id: model.id,
    modelID: model.id,
    providerID: provider.id,
    canonical: provider.id,
    name: model.name,
    package: provider.protocol,
    capabilities: { tools: model.tools !== false, input: ['text', 'image'], output: ['text'] },
    variants: [],
    time: { released: 0 },
    cost: [{ input: model.priceCurrency === 'USD' ? model.inputPricePerMillion || 0 : 0, output: model.priceCurrency === 'USD' ? model.outputPricePerMillion || 0 : 0, cache: { read: 0, write: 0 } }],
    status: 'active',
    enabled: true,
    limit: { context: model.contextWindow || 32768, input: model.contextWindow || 32768, output: model.maxOutputTokens || 4096 },
  };
}

function bridgeEvent(type: string, data: Record<string, unknown>, directory: string): BridgeEvent {
  return { id: eventId(), created: Date.now(), type, location: { directory }, data };
}

export const OpenCodeWorkspace: React.FC<OpenCodeWorkspaceProps> = ({
  currentSession,
  activeProject,
  activeSessionId,
  sessions,
  onSelectSession,
  onSessionsChange,
  selectedPresetId,
  onSelectPreset,
  workflowLicenseStatus,
  onEditProject,
  showToast,
}) => {
  const { isRoleVisible } = useRestrictedFeatures();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const streamPorts = useRef(new Set<MessagePort>());
  const eventContext = useRef({ sessions, activeProject, isRoleVisible, workflowLicenseStatus, onSessionsChange, onEditProject, showToast });
  eventContext.current = { sessions, activeProject, isRoleVisible, workflowLicenseStatus, onSessionsChange, onEditProject, showToast };
  const [draftId, setDraftId] = useState(() => `sess_${crypto.randomUUID()}`);
  const [frameError, setFrameError] = useState('');
  const [activeView, setActiveView] = useState<'chat' | 'code'>('chat');
  const [codeViewOpened, setCodeViewOpened] = useState(false);
  const [treeRefreshVersion, setTreeRefreshVersion] = useState(0);
  const [crmAccounts, setCrmAccounts] = useState<WorkspaceDataSources['crmAccounts']>([]);
  const [selectedTargetConnectorId, setSelectedTargetConnectorId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    void window.neoApi?.workspaceGetDataSources?.().then((sources) => {
      if (!cancelled && sources?.crmAccounts) {
        setCrmAccounts(sources.crmAccounts);
      }
    });
    return () => { cancelled = true; };
  }, [currentSession?.activeAccountId, currentSession?.environment?.id]);

  useEffect(() => {
    const activeSess = sessions.find((s) => s.id === activeSessionId);
    setSelectedTargetConnectorId(activeSess?.targetConnectorId || '');
  }, [activeSessionId, sessions]);

  // 严格过滤掉当前正在使用的账号与环境（当前环境是默认使用的）
  const availableTargetConnectors = useMemo(() => {
    return crmAccounts.filter((acc) => {
      if (currentSession?.activeAccountId && acc.accountId === currentSession.activeAccountId) return false;
      if (currentSession?.environment?.id && acc.connectorId === currentSession.environment.id && !currentSession.activeAccountId) return false;
      return true;
    });
  }, [crmAccounts, currentSession?.activeAccountId, currentSession?.environment?.id]);

  const currentConnectorInfo = useMemo(() => {
    if (!currentSession?.isLoggedIn) return { name: '未连接 CRM', product: '', tenant: '' };
    const envName = currentSession.environment?.name || '默认主连接器';
    const pType = currentSession.environment?.productType || 'neocrm';
    const pLabel = pType === 'salesforce' ? 'Salesforce' : pType === 'fxiaoke' ? '纷享销客' : '销售易';
    const tenant = currentSession.tokenData?.userInfo?.tenantName || currentSession.tokenData?.tenant_id || '';
    return { name: envName, product: pLabel, tenant: String(tenant) };
  }, [currentSession]);

  const handleSelectTargetConnector = async (accountId: string) => {
    setSelectedTargetConnectorId(accountId);
    if (activeSessionId) {
      const s = await getSession(idToOpenCode(activeSessionId));
      if (s) {
        const updated = { ...s, targetConnectorId: accountId || undefined, updatedAt: Date.now() };
        const saved = await window.neoApi?.aiPersistSession?.(updated);
        if (saved) {
          onSessionsChange([saved, ...eventContext.current.sessions.filter((item) => item.id !== saved.id)]);
        }
      }
    }
    if (accountId) {
      const matched = availableTargetConnectors.find((a) => a.accountId === accountId);
      showToast('info', `已在当前对话指定目标连接器：${matched?.connectorName || accountId}`);
    } else {
      showToast('info', '已取消指定目标连接器，恢复仅使用默认主租户');
    }
  };
  const fileRevisions = useRef(new Map<string, { revision: string; lineEnding: string }>());
  const preparing = useRef(new Set<string>());
  const submittingForms = useRef(new Set<string>());
  const previousSession = useRef(activeSessionId);
  useEffect(() => {
    if (previousSession.current && !activeSessionId) setDraftId(`sess_${crypto.randomUUID()}`);
    previousSession.current = activeSessionId;
  }, [activeSessionId]);

  const targetSessionId = activeSessionId || draftId;
  const workspaceUrl = useMemo(() => {
    const url = new URL(`neocrm-ui://bundle/server/${SERVER_KEY}/session/${idToOpenCode(targetSessionId)}`);
    url.searchParams.set('workspace', '1');
    return url.toString();
  }, [targetSessionId]);

  const emitEvent = useCallback((event: BridgeEvent) => {
    const chunk = `data: ${JSON.stringify(event)}\n\n`;
    for (const port of [...streamPorts.current]) {
      try { port.postMessage({ kind: 'chunk', chunk }); }
      catch { streamPorts.current.delete(port); }
    }
  }, []);

  const stream = useRef<OpenCodeStream | null>(null);
  if (!stream.current) stream.current = new OpenCodeStream({
    emit: (type, data, directory) => emitEvent(bridgeEvent(type, data, directory)),
    save: async session => {
      if (!window.neoApi?.aiPersistSession) throw new Error('会话保存接口不可用');
      await window.neoApi.aiPersistSession(session, false);
    },
    publish: session => {
      const context = eventContext.current;
      const summary = { ...session, messages: [], messagesLoaded: false, messageCount: session.messages.length };
      const next = [summary, ...context.sessions.filter(item => item.id !== session.id)];
      context.sessions = next;
      context.onSessionsChange(next);
    },
    onSaveError: error => eventContext.current.showToast('error', `回复尚未保存：${error instanceof Error ? error.message : '请检查会话存储'}`),
  });

  const getConfig = useCallback(async (): Promise<AiConfigData> => {
    return window.neoApi?.aiGetConfig ? window.neoApi.aiGetConfig() : { providers: [], settings: DEFAULT_AI_SETTINGS };
  }, []);

  const getSession = useCallback(async (openCodeId: string) => {
    const id = idFromOpenCode(openCodeId);
    const live = stream.current?.session(id);
    if (live) return live;
    const saved = await window.neoApi?.aiGetSession?.(id);
    if (saved) return saved;
    if (openCodeId === idToOpenCode(draftId) && !activeSessionId) {
      const config = await getConfig();
      const provider = config.providers.find(item => item.id === config.settings.defaultProviderId && item.enabled) || config.providers.find(item => item.enabled);
      const model = provider?.models.find(item => item.id === config.settings.defaultModelId) || provider?.models[0];
      return {
        id: draftId,
        title: '新会话',
        projectId: activeProject?.id,
        presetId: isRoleVisible(selectedPresetId) ? selectedPresetId : DEFAULT_AGENT,
        providerId: provider?.id || 'deepseek',
        modelId: model?.id || 'deepseek-chat',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } satisfies AiChatSession;
    }
    return null;
  }, [activeProject?.id, activeSessionId, draftId, getConfig, isRoleVisible, selectedPresetId]);

  const createSession = useCallback(async (body: any) => {
    const config = await getConfig();
    const providerId = body?.model?.providerID || config.settings.defaultProviderId;
    const provider = config.providers.find(item => item.id === providerId && item.enabled) || config.providers.find(item => item.enabled);
    if (!provider) throw new Error('请先在 NeoCRM 模型设置中启用一个模型服务');
    const modelId = body?.model?.id || config.settings.defaultModelId || provider.models[0]?.id;
    if (!provider.models.some(item => item.id === modelId)) throw new Error('所选模型不在已启用模型列表中');
    const presetId = body?.agent && isRoleVisible(body.agent) ? body.agent : isRoleVisible(selectedPresetId) ? selectedPresetId : DEFAULT_AGENT;
    const project = activeProject;
    const now = Date.now();
    const id = body?.id ? idFromOpenCode(body.id) : `sess_${crypto.randomUUID()}`;
    const session: AiChatSession = {
      id,
      title: String(body?.title || '新会话').slice(0, 100),
      projectId: project?.id,
      presetId,
      providerId: provider.id,
      modelId,
      messages: [],
      activeSkillIds: [],
      mode: 'standard',
      targetConnectorId: selectedTargetConnectorId || undefined,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await window.neoApi?.aiPersistSession?.(session);
    if (!saved) throw new Error('NeoCRM 未能创建会话');
    onSessionsChange([saved, ...eventContext.current.sessions.filter(item => item.id !== saved.id)]);
    onSelectSession(saved.id);
    onSelectPreset(presetId);
    setDraftId(saved.id);
    return saved;
  }, [activeProject, getConfig, isRoleVisible, onSelectPreset, onSelectSession, onSessionsChange, selectedPresetId]);

  const toSessionMessages = useCallback(async (openCodeId: string, url: URL) => {
    const sessionId = idFromOpenCode(openCodeId);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 100)));
    const rawCursor = url.searchParams.get('cursor');
    const ascending = rawCursor?.startsWith('asc:') || (!rawCursor && url.searchParams.get('order') === 'asc');
    if (ascending) {
      const session = await getSession(openCodeId);
      if (!session) return { data: [], cursor: {} };
      const messages = visibleSessionMessages(session);
      const start = rawCursor ? Number(rawCursor.slice(4)) : 0;
      if (!Number.isSafeInteger(start) || start < 0) throw new Error('无效的消息分页游标');
      const end = Math.min(messages.length, start + limit);
      return { data: messages.slice(start, end).map(message => toMessage(message, session)),
        cursor: end < messages.length ? { next: `asc:${end}` } : {} };
    }
    const cursor = Number(rawCursor);
    if (rawCursor && (!Number.isSafeInteger(cursor) || cursor < 0)) throw new Error('无效的消息分页游标');
    const before = Number.isFinite(cursor) && cursor > 0 ? cursor : undefined;
    const live = stream.current?.session(sessionId);
    if (live) {
      const messages = visibleSessionMessages(live);
      const end = Math.min(before ?? messages.length, messages.length);
      const start = Math.max(0, end - limit);
      const tail = messages.at(-1)?.id;
      return { data: messages.slice(start, end).reverse().map(message => toMessage(message, live, message.id === tail && stream.current!.active(sessionId))),
        cursor: start ? { next: String(start) } : {} };
    }
    const page = await window.neoApi?.aiGetSessionMessages?.(sessionId, before, limit);
    if (!page) return { data: [], cursor: {} };
    if (page.session.revert) {
      const loaded = await getSession(openCodeId);
      if (!loaded) return { data: [], cursor: {} };
      const messages = visibleSessionMessages(loaded);
      const end = Math.min(before ?? messages.length, messages.length);
      const start = Math.max(0, end - limit);
      return { data: messages.slice(start, end).reverse().map(message => toMessage(message, loaded)),
        cursor: start ? { next: String(start) } : {} };
    }
    const data = page.session.messages.toReversed().map(message => toMessage(message, page.session));
    const next = page.nextBefore === null ? undefined : String(page.nextBefore);
    return { data, cursor: { ...(next ? { next } : {}) } };
  }, [getSession]);

  const startPrompt = useCallback(async (openCodeId: string, body: any) => {
    const sessionId = idFromOpenCode(openCodeId);
    if (preparing.current.has(sessionId) || stream.current?.active(sessionId)) throw new Error('该会话仍在生成中');
    preparing.current.add(sessionId);
    let requestId: string | undefined;
    let assistantId: string | undefined;
    try {
      const previous = await getSession(openCodeId);
      if (!previous) throw new Error('会话不存在或已删除');
      if (previous.agentRun?.status === 'running' || previous.agentRun?.status === 'queued') throw new Error('该会话仍在生成中');
      const text = typeof body?.text === 'string' ? body.text : '';
      if (text.length > 100000) throw new Error('消息超过 100000 字符限制');
      const files = Array.isArray(body?.files) ? body.files : [];
      if (files.length > 20) throw new Error('一次最多引用 20 个项目文件或文件夹');
      const root = activeProject?.localPath;
      const attachments: AiFileAttachment[] = [];
      for (const file of files) {
        if (!root || typeof file?.uri !== 'string') throw new Error('请先选择项目，然后重新选择要引用的文件');
        let url: URL;
        try { url = new URL(file.uri); } catch { throw new Error('文件引用格式无效，请重新选择'); }
        if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost')) throw new Error('当前仅支持引用项目中的本地文件或文件夹');
        let absolute: string;
        try { absolute = decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1').replaceAll('\\', '/'); }
        catch { throw new Error('文件路径编码无效，请重新选择'); }
        const normalizedRoot = root.replaceAll('\\', '/').replace(/\/+$/, '');
        const windows = /^[A-Za-z]:\//.test(normalizedRoot);
        const prefix = `${normalizedRoot}/`;
        if (!(windows ? absolute.toLowerCase().startsWith(prefix.toLowerCase()) : absolute.startsWith(prefix))) throw new Error('只能引用当前项目目录内的文件或文件夹');
        const relative = relativeWorkspacePath(absolute.slice(prefix.length));
        if (!relative) throw new Error('请选择项目内的文件或文件夹');
        const slash = relative.lastIndexOf('/');
        const parent = slash < 0 ? root : workspaceFilePath(root, relative.slice(0, slash));
        const entries = await window.neoApi?.projectReadDirectory?.({ folderPath: root, directoryPath: parent, force: true });
        const node = entries?.nodes.find(item => item.relativePath.replaceAll('\\', '/') === relative);
        if (!node) throw new Error(`无法找到项目引用：${relative}`);
        const mention = file.mention && typeof file.mention.text === 'string' && Number.isInteger(file.mention.start) && Number.isInteger(file.mention.end)
          ? { text: file.mention.text, start: file.mention.start, end: file.mention.end } : undefined;
        const openCodeFile = { uri: file.uri, ...(mention ? { mention } : {}), ...(typeof file.description === 'string' ? { description: file.description } : {}) };
        if (node.type === 'directory') {
          attachments.push({ id: `file_${crypto.randomUUID()}`, name: node.name, fullPath: node.path, relativePath: relative,
            size: 0, mimeType: 'application/x-directory', parsedContent: '', contentKind: 'directory', openCodeFile });
        } else {
          const parsed = await window.neoApi?.fileParseLocalPath?.(node.path);
          if (!parsed) throw new Error('文件解析接口不可用，请重启应用');
          attachments.push({ ...parsed, fullPath: node.path, relativePath: relative, openCodeFile });
        }
      }
      const config = await getConfig();
      const provider = config.providers.find(item => item.id === previous.providerId && item.enabled);
      if (!provider || !provider.models.some(item => item.id === previous.modelId)) throw new Error('该会话的模型已停用，请重新选择模型');
      // 提取输入框中通过 @ 艾特出来的多个连接器 (支持名字匹配与 body.skills)
      const mentionedConnectorIds: string[] = [];
      for (const acc of crmAccounts) {
        const cleanName = acc.connectorName.trim().replace(/\s+/g, '_');
        const slug = `连接器-${cleanName}`;
        const isMentionedInSkills = Array.isArray(body?.skills) && body.skills.some(
          (s: any) => s?.id === slug || s?.name === slug || s?.id === acc.connectorName || s?.id === `connector-${acc.accountId}`
        );
        const safeName = acc.connectorName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const safeClean = cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`@(?:连接器[-_]|connector[-_])?(?:${safeName}|${safeClean})\\b`, 'i');
        if ((isMentionedInSkills || pattern.test(text)) && !mentionedConnectorIds.includes(acc.accountId)) {
          mentionedConnectorIds.push(acc.accountId);
        }
      }

      const allTargetConnectorIds = Array.from(new Set([
        ...mentionedConnectorIds,
        ...(selectedTargetConnectorId ? [selectedTargetConnectorId] : []),
        ...(previous.targetConnectorIds || []),
        ...(previous.targetConnectorId ? [previous.targetConnectorId] : []),
      ])).filter(Boolean);

      const allowedSkills = new Set((config.skills || []).filter(item => item.category === 'personal' && item.enabled).map(item => item.id));
      const skillIds = [...new Set([...(previous.activeSkillIds || []), ...(Array.isArray(body?.skills) ? body.skills.map((item: any) => String(item?.id || '')) : [])])]
        .filter(id => !id.startsWith('connector-') && allowedSkills.has(id));
      const user: AiChatMessage = {
        id: typeof body?.id === 'string' && body.id.startsWith('msg_') ? body.id : messageId('msg_u_'),
        role: 'user', content: text, createdAt: Date.now(),
        ...(skillIds.length ? { skillIds } : {}),
        ...(attachments.length ? { attachments } : {}),
      };
      const assistant: AiChatMessage = {
        id: messageId('msg_a_'), role: 'assistant', content: '', providerId: provider.id, modelId: previous.modelId, createdAt: Date.now() + 1,
      };
      const cleanHistory = visibleSessionMessages(previous).filter(message => message.role === 'user' || message.role === 'system' ||
        (message.role === 'assistant' && (!!message.content.trim() || !!message.toolCalls?.length)));
      const title = cleanHistory.length === 0 && text ? text.slice(0, 22) + (text.length > 22 ? '...' : '') : previous.title;
            const updated: AiChatSession = {
        ...previous,
        id: sessionId,
        title,
        projectId: activeProject?.id || previous.projectId,
        activeSkillIds: skillIds,
        targetConnectorId: allTargetConnectorIds[0] || undefined,
        targetConnectorIds: allTargetConnectorIds.length ? allTargetConnectorIds : undefined,
        messages: [...cleanHistory, user, assistant],
        revert: undefined,
        messagesLoaded: true,
        updatedAt: Date.now(),
      };
      const saved = await window.neoApi?.aiPersistSession?.(updated);
      if (!saved) throw new Error('NeoCRM 未能保存用户消息');
      const preset = AI_AGENT_PRESETS.find(item => item.id === saved.presetId && isRoleVisible(item.id)) || AI_AGENT_PRESETS.find(item => item.id === DEFAULT_AGENT)!;
      const directory = eventContext.current.activeProject?.localPath || '';
      requestId = `req_${crypto.randomUUID()}`;
      assistantId = assistant.id;
      stream.current!.start(saved, requestId, assistant.id, directory);
      onSessionsChange([saved, ...eventContext.current.sessions.filter(item => item.id !== saved.id)]);
      onSelectSession(saved.id);
      if (!window.neoApi?.aiStartChatStream) throw new Error('模型调用接口不可用');
      await window.neoApi.aiStartChatStream({
        requestId,
        sessionId,
        messageId: assistant.id,
        providerId: provider.id,
        modelId: saved.modelId,
        presetPrompt: preset.systemPrompt,
        messages: [...cleanHistory, user],
        enableTools: config.settings.enableCrmTools,
        activeSkillIds: skillIds,
        activeMcpServerIds: [],
        compactionSummary: saved.compactionSummary,
        projectPath: directory,
        mode: saved.mode || 'standard',
        targetConnectorId: allTargetConnectorIds[0] || undefined,
        targetConnectorIds: allTargetConnectorIds.length ? allTargetConnectorIds : undefined,
      });
      return {
        id: user.id,
        sessionID: openCodeId,
        time: { created: user.createdAt },
        type: 'user',
        payload: { text, files: attachments.map(file => ({ data: '', mime: file.mimeType, name: file.name,
          source: { type: 'uri', uri: file.openCodeFile!.uri }, ...(file.openCodeFile?.mention ? { mention: file.openCodeFile.mention } : {}) })),
          agents: [], skills: skillIds.map(id => ({ id, name: id })) },
        delivery: 'steer',
      };
    } catch (error) {
      if (requestId && assistantId) await stream.current!.receive({ requestId, sessionId, messageId: assistantId,
        type: 'error', error: error instanceof Error ? error.message : '模型启动失败' });
      throw error;
    } finally {
      preparing.current.delete(sessionId);
    }
  }, [activeProject?.id, emitEvent, getConfig, getSession, isRoleVisible, onSelectSession, onSessionsChange]);

  const handleApi = useCallback(async (request: BridgeRequest, port: MessagePort) => {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    const method = request.method.toUpperCase();
    const parts = path.split('/').filter(Boolean);
    const project = eventContext.current.activeProject;
    const location = projectLocation(project);
    const body = request.body ? JSON.parse(request.body) : {};

    const projectRoot = () => {
      if (!project?.localPath) throw new Error('请先从 NeoCRM 项目导航选择本地项目');
      const requested = url.searchParams.get('location[directory]');
      if (requested && requested !== project.localPath) throw new Error('文件操作的根目录与当前 NeoCRM 项目不一致');
      return project.localPath;
    };

    const fileList = async (relativePath: string) => {
      const root = projectRoot();
      const directoryPath = relativeWorkspacePath(relativePath);
      const result = await window.neoApi?.projectReadDirectory?.({ folderPath: root, directoryPath: directoryPath ? workspaceFilePath(root, directoryPath) : undefined });
      if (!result) throw new Error('项目目录读取接口不可用');
      return { location, data: result.nodes.map(node => ({ path: `./${node.relativePath}`, type: node.type, ignored: false })) };
    };

    if (path === '/api/info' && method === 'GET') {
      jsonResponse(port, { version: '1.0.0', pid: 0, hostname: 'NeoCRM', urls: [], paths: { tmp: '' }, capabilities: {} });
      return;
    }
    if (path === '/api/location' && method === 'GET') {
      jsonResponse(port, { ...location, project: { id: project?.id || 'global', directory: location.directory, canonical: location.directory } });
      return;
    }
    if (path === '/api/project' && method === 'GET') {
      const list = project ? [{ id: project.id, canonical: project.localPath, name: project.name, time: { created: project.createdAt, updated: project.updatedAt, active: project.updatedAt }, sandboxes: [] }] : [];
      jsonResponse(port, list);
      return;
    }
    if (path === '/api/mcp' && method === 'GET') {
      const config = await getConfig();
      const data = (config.mcpServers || []).map(server => ({
        name: server.id,
        title: server.name,
        status: !server.enabled
          ? { status: 'disabled' }
          : server.type === 'builtin' || (server.tools?.length || 0) > 0
            ? { status: 'connected' }
            : { status: 'pending' },
      }));
      jsonResponse(port, { location, data });
      return;
    }
    if (path === '/api/mcp/resource' && method === 'GET') {
      jsonResponse(port, { location, data: { resources: [], templates: [] } });
      return;
    }
    if (parts.length === 5 && parts[0] === 'api' && parts[1] === 'experimental' && parts[2] === 'mcp'
      && (parts[4] === 'connect' || parts[4] === 'disconnect') && method === 'POST') {
      const config = await getConfig();
      if (!(config.mcpServers || []).some(server => server.id === parts[3])) { errorResponse(port, '未找到指定的 MCP 服务', 404); return; }
      if (!window.neoApi?.aiSetMcpServerEnabled) throw new Error('MCP 状态接口不可用，请重启应用');
      await window.neoApi.aiSetMcpServerEnabled(parts[3], parts[4] === 'connect');
      emitEvent(bridgeEvent('mcp.status.changed', { server: parts[3] }, location.directory));
      jsonResponse(port, null, 204);
      return;
    }
    if (path === '/api/plugin' && method === 'GET') {
      jsonResponse(port, { location, data: [] });
      return;
    }
    if (path === '/api/fs/list' && method === 'GET') {
      jsonResponse(port, await fileList(url.searchParams.get('path') || ''));
      return;
    }
    if (path === '/api/fs/find' && method === 'GET') {
      const root = projectRoot();
      const query = url.searchParams.get('query') || '';
      const type = url.searchParams.get('type');
      const files = await window.neoApi?.projectListFiles?.({ folderPath: root, query, maxFiles: 5000 }) || [];
      const data = files
        .filter(file => !type || type === 'file')
        .map(file => ({ path: `./${file.relativePath}`, type: 'file', ignored: false }))
        .slice(0, Number(url.searchParams.get('limit') || 200));
      jsonResponse(port, { location, data });
      return;
    }
    if (path.startsWith('/api/fs/read/') && method === 'GET') {
      const root = projectRoot();
      const relative = relativeWorkspacePath(path.slice('/api/fs/read/'.length));
      if (!relative) throw new Error('缺少要读取的文件路径');
      const extension = relative.match(/\.([^.\/]+)$/)?.[1]?.toLowerCase();
      const imageType = extension ? IMAGE_CONTENT_TYPES[extension] : undefined;
      if (imageType) {
        if (!window.neoApi?.filePreviewMessage) throw new Error('当前客户端不支持项目图片预览，请更新客户端');
        let bytes: Uint8Array;
        if (extension === 'svg') {
          const preview = await window.neoApi.filePreviewMessage({ source: relative, projectPath: root, sessionId: idFromOpenCode(targetSessionId), diagram: true });
          if (preview.kind !== 'diagram' || preview.format !== 'svg') throw new Error('SVG 文件预览格式无效');
          bytes = new TextEncoder().encode(prepareSvgDiagram(preview.content).svg);
        } else {
          const preview = await window.neoApi.filePreviewMessage({ source: relative, projectPath: root, sessionId: idFromOpenCode(targetSessionId) });
          if (preview.kind !== 'image') throw new Error('图片文件预览格式无效');
          bytes = imageBytes(preview.dataUrl, imageType);
        }
        port.postMessage({ kind: 'response', status: 200, headers: [['content-type', imageType]], bodyBase64: bytesToBase64(bytes) });
        port.close();
        return;
      }
      const read = await window.neoApi?.editorRead?.(root, workspaceFilePath(root, relative));
      if (!read) throw new Error('项目文件读取接口不可用');
      fileRevisions.current.set(`${root}\0${relative}`, { revision: read.revision, lineEnding: read.lineEnding });
      const bytes = new TextEncoder().encode(read.content);
      port.postMessage({ kind: 'response', status: 200, headers: [['content-type', 'application/octet-stream'], ['etag', read.revision]], bodyBase64: bytesToBase64(bytes) });
      port.close();
      return;
    }
    if (path === '/api/experimental/fs/write' && method === 'POST') {
      const root = projectRoot();
      const relative = relativeWorkspacePath(url.searchParams.get('path') || '');
      if (!relative) throw new Error('缺少要写入的文件路径');
      const revisionKey = `${root}\0${relative}`;
      const snapshot = fileRevisions.current.get(revisionKey);
      if (!snapshot) throw new Error('写入前必须先通过 OpenCode 读取该文件以建立 revision');
      if (!request.bodyBase64) throw new Error('只支持通过受控二进制文件写入接口保存文本');
      const bytes = base64ToBytes(request.bodyBase64);
      if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('代码编辑文件不能超过 2 MB');
      const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r?\n/g, snapshot.lineEnding);
      const saved = await window.neoApi?.editorSave?.(root, workspaceFilePath(root, relative), content, snapshot.revision);
      if (!saved) throw new Error('项目文件保存接口不可用');
      fileRevisions.current.set(revisionKey, { revision: saved.revision, lineEnding: saved.lineEnding });
      jsonResponse(port, { location, data: { path: `./${saved.relativePath}` } });
      return;
    }
    if (path === '/api/config' && method === 'GET') { jsonResponse(port, [{ type: 'document', info: { experimental: { todo: true } } }]); return; }
    if (path === '/api/config/shell' && method === 'GET') { jsonResponse(port, []); return; }
    if (path === '/api/command' && method === 'GET') { jsonResponse(port, { location, data: [] }); return; }
    if (path === '/api/skill' && method === 'GET') {
      const config = await getConfig();
      // 动态将其他可用的 CRM 连接器以 @ 艾特候选形式暴露给 OpenCode 提示菜单 (严格排除当前正在使用的默认账号)
      const connectorMentions = availableTargetConnectors.map((acc) => {
        const cleanName = acc.connectorName.trim().replace(/\s+/g, '_');
        const pLabel = acc.productType === 'salesforce' ? 'Salesforce' : acc.productType === 'fxiaoke' ? '纷享销客' : '销售易';
        return {
          id: `连接器-${cleanName}`,
          name: `连接器-${acc.connectorName}`,
          description: `【CRM 连接器】${pLabel}${acc.tenantName ? ` · ${acc.tenantName}` : ''}`,
          autoinvoke: false,
          path: '/',
          content: `【用户在输入框中通过 @ 艾特指定的 CRM 连接器: ${acc.connectorName}】\n- 平台: ${pLabel}\n- 账号 ID (accountId): "${acc.accountId}"\n- 租户/企业: ${acc.tenantName || '未知'}\n在数据迁移、N→1合并、1→N拆分或跨环境操作时，以此作为协同/目标连接器。\n`,
        };
      });

      const personalSkills = (config.skills || []).filter((item) => item.enabled).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        autoinvoke: false,
        path: project?.localPath || '/',
        content: item.systemInstruction || '',
      }));

      jsonResponse(port, { location, data: [...connectorMentions, ...personalSkills] });
      return;
    }
    if (path === '/api/agent' && method === 'GET') {
      const presets = AI_AGENT_PRESETS.filter(item => isRoleVisible(item.id) &&
        (!requiresRoleLicense(item.id) || eventContext.current.workflowLicenseStatus?.isAuthorized));
      const agents = presets.map(item => ({
        id: item.id, name: item.name, description: item.description, system: item.systemPrompt,
        request: { settings: {}, headers: {}, body: {} }, mode: 'primary', hidden: false, permissions: [],
      }));
      jsonResponse(port, { location, data: agents });
      return;
    }
    if (path === '/api/provider' && method === 'GET') {
      const config = await getConfig();
      const providers = config.providers.filter(item => item.enabled).map(item => ({
        id: item.id, name: item.name, activation: 'enabled', package: item.protocol,
        settings: {}, headers: {}, body: {},
      }));
      jsonResponse(port, { location, data: providers });
      return;
    }
    if (path === '/api/model' && method === 'GET') {
      const config = await getConfig();
      jsonResponse(port, { location, data: config.providers.filter(item => item.enabled).flatMap(provider => provider.models.map(model => modelInfo(provider, model))) });
      return;
    }
    if (path === '/api/model/default' && method === 'GET') {
      const config = await getConfig();
      const provider = config.providers.find(item => item.id === config.settings.defaultProviderId && item.enabled) || config.providers.find(item => item.enabled);
      const model = provider?.models.find(item => item.id === config.settings.defaultModelId) || provider?.models[0];
      jsonResponse(port, { location, data: provider && model ? modelInfo(provider, model) : undefined });
      return;
    }
    if (path === '/api/session/active' && method === 'GET') {
      const items = await window.neoApi?.aiGetSessions?.() || [];
      const ids = new Set([...items.filter(item => item.agentRun?.status === 'running' || item.agentRun?.status === 'queued').map(item => item.id),
        ...stream.current!.activeIds()]);
      const data = Object.fromEntries([...ids].map(id => [idToOpenCode(id), { type: 'running' }]));
      jsonResponse(port, { data });
      return;
    }
    if (path === '/api/form' && method === 'GET') {
      jsonResponse(port, { location, data: [] });
      return;
    }
    if (path === '/api/session' && method === 'GET') {
      const items = await window.neoApi?.aiGetSessions?.() || [];
      const visible = items.filter(item => !project || !item.projectId || item.projectId === project.id);
      jsonResponse(port, { data: visible.map(item => toSessionInfo(item, project)), cursor: {} });
      return;
    }
    if (path === '/api/session' && method === 'POST') {
      const created = await createSession(body);
      jsonResponse(port, { data: toSessionInfo(created, project) });
      emitEvent(bridgeEvent('session.created', {
        sessionID: idToOpenCode(created.id), projectID: created.projectId || project?.id || 'global',
        location, subpath: '', parentID: undefined, slug: created.title, title: created.title,
        agent: created.presetId, model: modelRef(created), metadata: {}, permissions: [], version: '1.0.0',
      }, location.directory));
      return;
    }
    if (parts[0] === 'api' && parts[1] === 'experimental' && parts[2] === 'session' && parts[3] && parts[4] === 'wait' && method === 'POST') {
      await stream.current!.wait(idFromOpenCode(parts[3]));
      jsonResponse(port, null, 204);
      return;
    }
    if (parts[0] === 'api' && parts[1] === 'session' && parts[2]) {
      const openId = parts[2];
      if (parts.length === 3 && method === 'GET') {
        const session = await getSession(openId);
        if (!session) { errorResponse(port, 'Session not found', 404); return; }
        jsonResponse(port, { data: toSessionInfo(session, project) });
        return;
      }
      if (parts.length === 4 && parts[3] === 'message' && method === 'GET') {
        jsonResponse(port, await toSessionMessages(openId, url));
        return;
      }
      if (parts.length === 4 && parts[3] === 'form' && method === 'GET') {
        const session = await getSession(openId);
        if (!session) { errorResponse(port, 'Session not found', 404); return; }
        const form = pendingQuestion(session);
        jsonResponse(port, { data: form ? [form] : [] });
        return;
      }
      if (parts.length >= 5 && parts[3] === 'form' && (method === 'POST' || method === 'DELETE')) {
        const session = await getSession(openId);
        const form = session && pendingQuestion(session);
        if (!form || form.id !== parts[4]) { errorResponse(port, '该问题不存在或已经回答', 404); return; }
        if (submittingForms.current.has(form.id) || stream.current!.active(session!.id)) { errorResponse(port, '问题正在提交，请稍候', 409); return; }
        if (method === 'POST' && (parts.length !== 6 || parts[5] !== 'reply')) { errorResponse(port, '不支持的表单操作', 404); return; }
        if (method === 'DELETE' && parts.length !== 5) { errorResponse(port, '不支持的表单操作', 404); return; }
        const answer = body?.answer;
        const values = method === 'DELETE' ? [] : form.fields.map(field => {
          const value = answer?.[field.key];
          const selected = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
          if (!selected.length || selected.some((item: unknown) => typeof item !== 'string' || !item.trim()) ||
              (field.type !== 'multiselect' && selected.length !== 1) ||
              (!field.custom && selected.some((item: string) => !field.options.some((option: { value: string }) => option.value === item)))) return null;
          return { question: field.description, answer: selected.join('、') };
        });
        if (values.some(value => value === null)) { errorResponse(port, '请回答每个问题并选择有效选项', 400); return; }
        submittingForms.current.add(form.id);
        try {
          const text = method === 'DELETE' ? '用户取消了本次提问，请停止相关操作并说明。' :
            '用户已回答以下问题：\n' + values.map(value => `${value!.question}：${value!.answer}`).join('\n');
          await startPrompt(openId, { text });
          emitEvent(bridgeEvent(method === 'DELETE' ? 'form.cancelled' : 'form.replied', { id: form.id, sessionID: openId, ...(method === 'POST' ? { answer } : {}) }, location.directory));
          jsonResponse(port, null, 204);
        } finally { submittingForms.current.delete(form.id); }
        return;
      }
      if (parts.length === 4 && parts[3] === 'fork' && method === 'POST') {
        const parent = await getSession(openId);
        if (!parent) { errorResponse(port, 'Session not found', 404); return; }
        if (stream.current!.active(parent.id)) { errorResponse(port, '请先停止生成再创建会话分支', 409); return; }
        const before = typeof body?.before === 'string' ? body.before : undefined;
        const messages = visibleSessionMessages(parent);
        const boundary = before ? messages.findIndex(message => message.id === before) : messages.length;
        if (before && boundary < 0) { errorResponse(port, '所选消息不存在或已被撤销', 404); return; }
        if (before && messages[boundary]?.role !== 'user') { errorResponse(port, '只能从用户消息创建会话分支', 400); return; }
        if (!boundary) { errorResponse(port, '所选消息之前没有可继承的对话内容', 400); return; }
        const now = Date.now();
        const id = `sess_${crypto.randomUUID()}`;
        const forked: AiChatSession = {
          ...parent,
          id,
          title: `${parent.title}（分支）`.slice(0, 100),
          messages: structuredClone(messages.slice(0, boundary)),
          messagesLoaded: true,
          messageCount: undefined,
          compactionSummary: parent.compactionSummary && boundary >= parent.compactionSummary.originalMessageCount
            ? parent.compactionSummary : undefined,
          revert: undefined,
          agentRun: undefined,
          fork: { sessionId: parent.id, ...(before ? { boundary: { type: 'before', messageID: before } as const } : {}) },
          createdAt: now,
          updatedAt: now,
        };
        const saved = await window.neoApi?.aiPersistSession?.(forked);
        if (!saved) throw new Error('NeoCRM 未能创建会话分支');
        onSessionsChange([saved, ...eventContext.current.sessions.filter(item => item.id !== saved.id)]);
        const forkId = idToOpenCode(saved.id);
        emitEvent(bridgeEvent('session.forked', {
          sessionID: forkId, parentID: openId,
          boundary: before ? { type: 'before', messageID: before } : { type: 'through', messageID: messages.at(-1)?.id || '' },
        }, location.directory));
        jsonResponse(port, { data: toSessionInfo(saved, project) });
        return;
      }
      if (parts.length === 5 && parts[3] === 'revert' && parts[4] === 'stage' && method === 'POST') {
        const session = await getSession(openId);
        if (!session) { errorResponse(port, 'Session not found', 404); return; }
        if (stream.current!.active(session.id)) { errorResponse(port, '请先停止生成再撤销对话', 409); return; }
        const messageID = typeof body?.messageID === 'string' ? body.messageID : '';
        const target = session.messages.find(message => message.id === messageID);
        if (!target || target.role !== 'user') { errorResponse(port, '撤销目标必须是当前会话中的用户消息', 400); return; }
        const saved = await window.neoApi?.aiPersistSession?.({ ...session, revert: { messageID }, updatedAt: Date.now() });
        if (!saved) throw new Error('NeoCRM 未能暂存撤销状态');
        onSessionsChange([saved, ...eventContext.current.sessions.filter(item => item.id !== saved.id)]);
        emitEvent(bridgeEvent('session.revert.staged', { sessionID: openId, revert: { messageID, files: [] } }, location.directory));
        showToast('info', '对话已撤销；已修改的项目文件不会自动回滚。');
        jsonResponse(port, { data: { messageID, files: [] } });
        return;
      }
      if (parts.length === 4 && parts[3] === 'revert' && method === 'DELETE') {
        const session = await getSession(openId);
        if (!session) { errorResponse(port, 'Session not found', 404); return; }
        if (!session.revert) { jsonResponse(port, null, 204); return; }
        const { revert: _revert, ...rest } = session;
        const saved = await window.neoApi?.aiPersistSession?.({ ...rest, updatedAt: Date.now() });
        if (!saved) throw new Error('NeoCRM 未能恢复撤销的对话');
        onSessionsChange([saved, ...eventContext.current.sessions.filter(item => item.id !== saved.id)]);
        emitEvent(bridgeEvent('session.revert.cleared', { sessionID: openId }, location.directory));
        jsonResponse(port, null, 204);
        return;
      }
      if (parts.length === 5 && parts[3] === 'revert' && parts[4] === 'commit' && method === 'POST') {
        const session = await getSession(openId);
        if (!session) { errorResponse(port, 'Session not found', 404); return; }
        if (!session.revert) { jsonResponse(port, null, 204); return; }
        const boundary = session.messages.findIndex(message => message.id === session.revert?.messageID);
        const { revert: _revert, ...rest } = session;
        const clearSummary = boundary >= 0 && !!session.compactionSummary && boundary < session.compactionSummary.originalMessageCount;
        const saved = await window.neoApi?.aiPersistSession?.({ ...rest, messages: boundary < 0 ? session.messages : session.messages.slice(0, boundary),
          compactionSummary: clearSummary ? undefined : session.compactionSummary, updatedAt: Date.now() });
        if (!saved) throw new Error('NeoCRM 未能提交对话撤销');
        onSessionsChange([saved, ...eventContext.current.sessions.filter(item => item.id !== saved.id)]);
        emitEvent(bridgeEvent('session.revert.committed', { sessionID: openId, to: session.revert.messageID }, location.directory));
        jsonResponse(port, null, 204);
        return;
      }
      if (parts.length === 4 && parts[3] === 'inbox' && method === 'GET') {
        // NeoCRM starts prompts through its AgentRuntime, so there is no separate
        // durable OpenCode inbox to expose to the embedded renderer.
        jsonResponse(port, { data: [] });
        return;
      }
      if (parts.length === 5 && parts[3] === 'inbox' && (method === 'PATCH' || method === 'DELETE')) {
        errorResponse(port, 'NeoCRM 当前不支持通过 OpenCode UI 排队或撤回待处理消息', 403);
        return;
      }
      if (parts.length === 4 && parts[3] === 'prompt' && method === 'POST') {
        jsonResponse(port, await startPrompt(openId, body));
        return;
      }
      if (parts.length === 4 && parts[3] === 'interrupt' && method === 'POST') {
        const stopped = await stream.current!.stop(idFromOpenCode(openId), requestId => window.neoApi.aiAbortChatStream(requestId));
        jsonResponse(port, { interrupted: Boolean(stopped) });
        return;
      }
      if (parts.length === 4 && parts[3] === 'model' && method === 'POST') {
        if (preparing.current.has(idFromOpenCode(openId)) || stream.current!.active(idFromOpenCode(openId))) throw new Error('请先停止生成再切换模型');
        const session = await getSession(openId);
        if (!session) { errorResponse(port, 'Session not found', 404); return; }
        const config = await getConfig();
        const providerID = body?.model?.providerID;
        const modelID = body?.model?.id;
        const provider = config.providers.find(item => item.id === providerID && item.enabled);
        if (!provider || !provider.models.some(item => item.id === modelID)) { errorResponse(port, 'Model is not enabled in NeoCRM', 400); return; }
        const updated = { ...session, providerId: provider.id, modelId: modelID, updatedAt: Date.now() };
        const saved = await window.neoApi?.aiPersistSession?.(updated);
        if (!saved) { errorResponse(port, 'Could not update session model', 500); return; }
        onSessionsChange([saved, ...eventContext.current.sessions.filter(item => item.id !== saved.id)]);
        emitEvent(bridgeEvent('session.model.selected', { sessionID: openId, model: { providerID, id: modelID } }, location.directory));
        jsonResponse(port, null, 204);
        return;
      }
      if (parts.length === 4 && parts[3] === 'agent' && method === 'POST') {
        if (preparing.current.has(idFromOpenCode(openId)) || stream.current!.active(idFromOpenCode(openId))) throw new Error('请先停止生成再切换助手');
        const session = await getSession(openId);
        if (!session) { errorResponse(port, 'Session not found', 404); return; }
        const preset = AI_AGENT_PRESETS.find(item => item.id === body?.agent && isRoleVisible(item.id));
        if (!preset || (requiresRoleLicense(preset.id) && !eventContext.current.workflowLicenseStatus?.isAuthorized)) {
          errorResponse(port, '该 Agent 当前不可用或尚未授权', 403);
          return;
        }
        const saved = await window.neoApi?.aiPersistSession?.({ ...session, presetId: preset.id, updatedAt: Date.now() });
        if (!saved) { errorResponse(port, 'Could not update session agent', 500); return; }
        onSessionsChange([saved, ...eventContext.current.sessions.filter(item => item.id !== saved.id)]);
        onSelectPreset(preset.id);
        emitEvent(bridgeEvent('session.agent.selected', { sessionID: openId, agent: preset.id }, location.directory));
        jsonResponse(port, null, 204);
        return;
      }
      if (parts.length === 3 && method === 'PATCH') {
        const session = await getSession(openId);
        if (!session) { errorResponse(port, 'Session not found', 404); return; }
        if (body?.archived !== undefined || body?.permissions !== undefined || body?.metadata !== undefined) {
          errorResponse(port, '该会话操作暂不支持通过 OpenCode UI 修改', 403);
          return;
        }
        const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 100) : session.title;
        const saved = await window.neoApi?.aiPersistSession?.({ ...session, title: title || session.title, updatedAt: Date.now() });
        if (!saved) { errorResponse(port, 'Could not rename session', 500); return; }
        onSessionsChange([saved, ...eventContext.current.sessions.filter(item => item.id !== saved.id)]);
        emitEvent(bridgeEvent('session.renamed', { sessionID: openId, title: saved.title }, location.directory));
        jsonResponse(port, null, 204);
        return;
      }
      if (parts.length === 4 && parts[3] === 'diff' && method === 'GET') {
        jsonResponse(port, { data: [] });
        return;
      }
      if (parts.length === 4 && parts[3] === 'permission' && method === 'GET') {
        jsonResponse(port, { data: [] });
        return;
      }
      if (parts.length === 4 && parts[3] === 'permission' && method === 'POST') {
        errorResponse(port, 'OpenCode 权限请求由 NeoCRM Agent 服务管理', 403);
        return;
      }
      if (parts.length === 3 && method === 'DELETE') {
        if (preparing.current.has(idFromOpenCode(openId)) || stream.current!.active(idFromOpenCode(openId))) throw new Error('请先停止生成再删除会话');
        await window.neoApi?.aiDeleteSession?.(idFromOpenCode(openId));
        onSelectSession(null);
        jsonResponse(port, null, 204);
        return;
      }
    }
    if (path === '/api/event' && method === 'GET') {
      port.postMessage({ kind: 'response', status: 200, headers: [['content-type', 'text/event-stream'], ['cache-control', 'no-cache']], stream: true });
      streamPorts.current.add(port);
      port.onmessage = event => {
        if (event.data?.kind !== 'abort') return;
        streamPorts.current.delete(port);
        port.close();
      };
      port.start();
      const connected = bridgeEvent('server.connected', {}, location.directory);
      port.postMessage({ kind: 'chunk', chunk: `data: ${JSON.stringify(connected)}\n\n` });
      return;
    }

    errorResponse(port, `Unsupported OpenCode API route: ${method} ${path}`, 404);
  }, [activeProject, createSession, emitEvent, getConfig, getSession, isRoleVisible, onSelectSession, onSessionsChange, startPrompt, toSessionMessages]);

  const handleApiRef = useRef(handleApi);
  handleApiRef.current = handleApi;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== new URL(workspaceUrl).origin) return;
      const port = event.ports[0];
      const incoming = event.data as BridgeRequest | ClipboardBridgeRequest | ProjectActionBridgeRequest | RevealBridgeRequest;
      if (incoming?.type === 'neo-opencode-project-action') {
        const project = eventContext.current.activeProject;
        if (!project?.localPath || incoming.directory !== project.localPath) return;
        if (incoming.action === 'open') {
          setCodeViewOpened(true);
          setActiveView('code');
        } else if (eventContext.current.onEditProject) {
          eventContext.current.onEditProject(project);
        } else {
          eventContext.current.showToast('error', '项目编辑窗口暂不可用');
        }
        return;
      }
      if (!port) return;
      port.start();
      if (incoming?.type === 'neo-opencode-clipboard-write') {
        const writeClipboard = window.neoApi?.clipboardWriteText;
        if (!writeClipboard) {
          port.postMessage({ copied: false });
          port.close();
          return;
        }
        void writeClipboard(incoming.text).then(copied => {
          port.postMessage({ copied: copied !== false });
          port.close();
        }).catch(() => {
          port.postMessage({ copied: false });
          port.close();
        });
        return;
      }
      if (incoming?.type === 'neo-opencode-reveal-path') {
        const project = eventContext.current.activeProject;
        if (!project?.localPath || incoming.directory !== project.localPath) {
          port.postMessage({ revealed: false });
          port.close();
          return;
        }
        const reveal = window.neoApi?.shellShowItemInFolder;
        if (!reveal) {
          port.postMessage({ revealed: false });
          port.close();
          return;
        }
        void reveal(project.localPath).then(() => {
          port.postMessage({ revealed: true });
          port.close();
        }).catch(() => {
          port.postMessage({ revealed: false });
          port.close();
        });
        return;
      }
      const request = incoming as BridgeRequest;
      if (request?.type !== 'neo-opencode-rpc') return;
      void handleApiRef.current(request, port).catch(error => {
        errorResponse(port, error instanceof Error ? error.message : 'NeoCRM API request failed', 500);
      });
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      for (const port of streamPorts.current) { try { port.close(); } catch {} }
      streamPorts.current.clear();
    };
  }, [workspaceUrl]);

  useEffect(() => {
    const unsubscribe = window.neoApi?.onAiStreamEvent?.((event: AiStreamEvent) => {
      if (event.type === 'tool_update') setTreeRefreshVersion(version => version + 1);
      void stream.current!.receive(event).catch(error => eventContext.current.showToast('error', String(error)));
    });
    return () => { unsubscribe?.(); stream.current?.dispose(); };
  }, []);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white">
      <nav className="flex h-10 shrink-0 items-center gap-1 border-b border-slate-200 bg-slate-50 px-3" aria-label="工作区视图" role="tablist">
        <button type="button" role="tab" aria-selected={activeView === 'chat'} onClick={() => setActiveView('chat')}
          className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${activeView === 'chat' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
          <MessageSquareText size={14} />对话
        </button>
        <button type="button" role="tab" aria-selected={activeView === 'code'} aria-controls="workspace-code-view"
          disabled={!activeProject?.localPath}
          title={activeProject?.localPath ? '打开项目文件树与代码查看器' : '先从项目导航选择本地项目'}
          onClick={() => { setCodeViewOpened(true); setActiveView('code'); }}
          className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-45 ${activeView === 'code' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
          <Code2 size={14} />代码
        </button>
        
        <span className="ml-auto truncate text-[11px] text-slate-500" title={activeProject?.localPath || ''}>{activeProject?.name || '未选择项目'}</span>
      </nav>
      <div className={activeView === 'chat' ? 'relative flex min-h-0 flex-1 flex-col' : 'hidden'}>
        {frameError && <div className="absolute inset-x-0 top-0 z-10 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800">OpenCode 工作区加载失败：{frameError}</div>}
        <iframe
          ref={frameRef}
          key={workspaceUrl}
          title="OpenCode 会话工作区"
          src={workspaceUrl}
          className="h-full min-h-0 w-full flex-1 border-0 bg-white"
          onError={() => setFrameError('无法读取嵌入资源，请重新构建应用。')}
          allow="clipboard-read; clipboard-write"
        />
      </div>
      {codeViewOpened && <div id="workspace-code-view" role="tabpanel" aria-label="项目代码" className={activeView === 'code' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}>
        <Suspense fallback={<div className="suite-loading" role="status">正在打开项目文件树…</div>}>
          <WorkspaceCodeEditor root={activeProject?.localPath || ''} name={activeProject?.name || ''}
            refreshVersion={String(treeRefreshVersion)} onOpenFile={path => { void window.neoApi?.shellOpenPath?.(path).catch(error => showToast('error', `打开文件失败：${error.message}`)); }}
            onRevealFile={path => { void window.neoApi?.shellShowItemInFolder?.(path).catch(error => showToast('error', `定位文件失败：${error.message}`)); }} />
        </Suspense>
      </div>}
    </div>
  );
};
