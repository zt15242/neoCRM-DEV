import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrowserFrameController } from './browserFrames';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  signal?: AbortSignal;
  abort?: () => void;
}

/** Local, explicitly started bridge. Tokens never enter model-visible tool results. */
export class BrowserBridge {
  private server?: http.Server;
  private secret = '';
  private port = 0;
  private lastSeen = 0;
  private webSockets?: WebSocketServer;
  private extension?: WebSocket;
  private refs = new Map<number, { stamp: string; items: Map<string, string> }>();
  private frames = new BrowserFrameController();
  private uploadDir?: string;
  private pending = new Map<string, Pending>();
  private queue: Array<{ id: string; action: string; params: Record<string, unknown> }> = [];
  private uploads = new Map<string, string>();
  private sessionTargets = new Map<string, number>();
  private sessionRefs = new Map<string, Map<string, { tabId: number; frameId?: string }>>();
  private openedTabs = new Map<string, number>();
  private openingTabs = new Map<string, Promise<unknown>>();
  private persistencePath?: string;
  private saved?: { token: string; port: number; enabled: boolean };

  configurePersistence(file: string) {
    this.persistencePath = file;
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (/^[a-f0-9]{64}$/.test(value.token) && value.port === 39877) this.saved = { token: value.token, port: value.port, enabled: value.enabled === true };
    } catch { /* first use */ }
  }
  get autoStartEnabled() { return this.saved?.enabled === true; }
  private saveEnabled(enabled: boolean) {
    if (!this.persistencePath || !this.saved) return;
    this.saved.enabled = enabled;
    fs.mkdirSync(path.dirname(this.persistencePath), { recursive: true });
    fs.writeFileSync(this.persistencePath, JSON.stringify(this.saved), { mode: 0o600 });
  }

  async start(): Promise<{ port: number; token: string }> {
    if (this.server) return { port: this.port, token: this.secret };
    const secret = this.saved?.token || randomBytes(32).toString('hex');
    const server = http.createServer((req, res) => { void this.handle(req, res); });
    const sockets = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
    server.on('upgrade', (req, socket, head) => {
      let url: URL;
      try { url = new URL(req.url || '', `http://127.0.0.1:${this.port}`); } catch { socket.destroy(); return; }
      const supplied = Buffer.from(url.searchParams.get('token') || '');
      const expected = Buffer.from(this.secret);
      if (req.headers.host !== `127.0.0.1:${this.port}` || url.pathname !== '/ws' || !/^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin || '') || !expected.length || supplied.length !== expected.length || !timingSafeEqual(supplied, expected) || this.extension) { socket.destroy(); return; }
      sockets.handleUpgrade(req, socket, head, (ws) => this.attachExtension(ws));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.persistencePath ? 39877 : 0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
    this.server = server;
    this.webSockets = sockets;
    this.secret = secret;
    this.port = (server.address() as { port: number }).port;
    if (this.persistencePath) {
      this.saved = { token: secret, port: this.port, enabled: true };
      try { this.saveEnabled(true); } catch (error) { this.stop(false); throw error; }
    }
    return { port: this.port, token: this.secret };
  }

  status() { return { listening: !!this.server, connected: !!this.server && (this.extension?.readyState === WebSocket.OPEN || Date.now() - this.lastSeen < 5000), port: this.port }; }

  stop(disable = true) {
    if (disable) this.saveEnabled(false);
    this.server?.close();
    this.extension?.terminate();
    this.extension = undefined;
    this.webSockets?.close();
    this.webSockets = undefined;
    this.refs.clear();
    this.frames.clear();
    if (this.uploadDir) { try { fs.rmSync(this.uploadDir, { recursive: true, force: true }); } catch { /* best effort on shutdown */ } this.uploadDir = undefined; }
    this.server = undefined;
    this.secret = '';
    this.port = 0;
    this.lastSeen = 0;
    this.queue = [];
    this.uploads.clear();
    this.sessionTargets.clear();
    this.sessionRefs.clear();
    this.openedTabs.clear();
    this.openingTabs.clear();
    for (const id of this.pending.keys()) this.finish(id, new Error('浏览器连接已关闭'));
  }

  async execute(action: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    if (!this.status().connected) throw new Error('浏览器扩展尚未连接，请在设置中启动并配对');
    if (this.extension?.readyState === WebSocket.OPEN) return this.executeDsh(action, params, signal);
    if (action === 'upload') {
      const file = params.stagedFile;
      if (typeof file !== 'string' || !this.uploadDir || path.dirname(path.dirname(file)) !== this.uploadDir) throw new Error('文件上传参数无效');
      const id = randomBytes(24).toString('hex');
      this.uploads.set(id, file);
      try { return await this.enqueue(action, { tabId: params.tabId, ref: params.ref, uploadId: id, fileName: path.basename(file) }, signal, false); }
      finally { this.uploads.delete(id); }
    }
    return this.enqueue(action, params, signal, false);
  }

  async executeForSession(sessionId: string, action: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    if (!sessionId) throw new Error('浏览器操作缺少会话信息');
    if (action !== 'tabs' && action !== 'open') {
      const owner = typeof params.ref === 'string' ? this.sessionRefs.get(sessionId)?.get(params.ref) : undefined;
      if (params.tabId === undefined && owner) params = { ...params, tabId: owner.tabId };
      if (typeof params.tabId !== 'number' || !Number.isInteger(params.tabId) || params.tabId < 0) {
        throw new Error('缺少有效的标签页 ID（tabId）。请先调用 tabs 获取标签页 ID，再调用 snapshot 获取元素引用；仅可省略当前会话已读取快照中 ref 对应的 tabId。');
      }
      if (owner && owner.tabId !== params.tabId) throw new Error('元素引用与标签页 ID 不匹配，请对目标标签页重新调用 snapshot');
    }
    if (action === 'open' && params.newTab !== true) {
      const url = new URL(String(params.url || ''));
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只允许打开 HTTP(S) 网页');
      const key = `${sessionId}\n${url.href}`;
      const pending = this.openingTabs.get(key);
      if (pending) return pending;
      const task = (async () => {
        const tabs = await this.execute('tabs', {}, signal) as Array<{ id: number; url?: string; title?: string }>;
        const savedId = this.openedTabs.get(key);
        const existing = tabs.find(tab => tab.id === savedId) || tabs.find(tab => tab.url === url.href);
        if (existing) {
          this.openedTabs.set(key, existing.id);
          this.sessionTargets.set(sessionId, existing.id);
          return { id: existing.id, url: existing.url, title: existing.title, reused: true };
        }
        const opened = await this.execute('open', { url: url.href }, signal) as { id?: number; tabId?: number };
        const id = opened?.id ?? opened?.tabId;
        if (typeof id === 'number') { this.openedTabs.set(key, id); this.sessionTargets.set(sessionId, id); }
        return opened;
      })();
      this.openingTabs.set(key, task);
      try { return await task; } finally { if (this.openingTabs.get(key) === task) this.openingTabs.delete(key); }
    }
    const result = await this.execute(action, params, signal);
    const tabId = action === 'open' ? (result as any)?.id ?? (result as any)?.tabId : params.tabId;
    if (action !== 'tabs' && typeof tabId === 'number' && Number.isInteger(tabId)) this.sessionTargets.set(sessionId, tabId);
    if (action === 'snapshot' && typeof tabId === 'number' && result && typeof result === 'object') {
      const snapshot = result as { frameId?: string; elements?: Array<{ ref?: string }> };
      const refs = this.sessionRefs.get(sessionId) || new Map<string, { tabId: number; frameId?: string }>();
      for (const [ref, owner] of refs) if (owner.tabId === tabId && owner.frameId === snapshot.frameId) refs.delete(ref);
      for (const item of snapshot.elements || []) if (typeof item.ref === 'string') refs.set(item.ref, { tabId, frameId: snapshot.frameId });
      while (refs.size > 2000) refs.delete(refs.keys().next().value!);
      this.sessionRefs.set(sessionId, refs);
      return { ...result, tabId };
    }
    return result;
  }

  async previewSession(sessionId: string): Promise<{ imageUrl?: string; message?: string }> {
    const tabId = this.sessionTargets.get(sessionId);
    if (tabId === undefined) return { message: '当前会话尚未操作浏览器页面' };
    if (!this.status().connected) return { message: '浏览器助手未连接' };
    try {
      const image = await this.execute('screenshot', { tabId }) as { mimeType?: string; imageData?: string };
      if (image?.mimeType !== 'image/jpeg' || typeof image.imageData !== 'string' || image.imageData.length > 6 * 1024 * 1024 || !/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(image.imageData)) throw new Error('截图无效');
      return { imageUrl: `data:image/jpeg;base64,${image.imageData}` };
    } catch (error: any) {
      const message = String(error?.message || '无法读取预览');
      if (/all_urls|activeTab/i.test(message)) return { message: '浏览器截图权限不足。请在 Chrome 扩展管理中重新加载 NeoCRM 浏览器助手，并确认网站访问权限为“在所有网站上”。' };
      return { message: message.slice(0, 200) };
    }
  }

  async stageUpload(bytes: Buffer, fileName: string): Promise<string> {
    if (!this.status().connected) throw new Error('浏览器扩展尚未连接');
    if (!this.uploadDir) this.uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neocrm-browser-upload-'));
    const folder = fs.mkdtempSync(path.join(this.uploadDir, 'file-'));
    const safeName = path.basename(fileName).replace(/[\x00-\x1f]/g, '_') || 'upload';
    const target = path.join(folder, safeName);
    await fs.promises.writeFile(target, bytes, { mode: 0o600, flag: 'wx' });
    if (!this.server || path.dirname(folder) !== this.uploadDir) { await fs.promises.rm(folder, { recursive: true, force: true }); throw new Error('浏览器连接已关闭'); }
    return target;
  }

  private enqueue(action: string, params: Record<string, unknown>, signal: AbortSignal | undefined, dsh: boolean): Promise<unknown> {
    if (signal?.aborted) throw new Error('操作已取消');
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.finish(id, new Error('浏览器操作超时')), 30000);
      const abort = () => this.finish(id, new Error('操作已取消'));
      this.pending.set(id, { resolve, reject, timer, signal, abort });
      signal?.addEventListener('abort', abort, { once: true });
      if (dsh) this.extension!.send(JSON.stringify({ type: 'command', id, command: action, params }));
      else this.queue.push({ id, action, params });
    });
  }

  private attachExtension(ws: WebSocket) {
    this.extension = ws;
    ws.on('error', () => {});
    ws.on('message', data => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', t: msg.t }));
        if (msg.type === 'result' && typeof msg.id === 'string' && typeof msg.ok === 'boolean') this.finish(msg.id, msg.ok ? undefined : new Error(String(msg.error || '浏览器操作失败').slice(0, 500)), msg.result);
      } catch { ws.close(1007); }
    });
    ws.on('close', () => {
      if (this.extension !== ws) return;
      this.extension = undefined;
      this.refs.clear();
      this.frames.clear();
      for (const id of this.pending.keys()) this.finish(id, new Error('浏览器连接已断开'));
    });
  }

  private async executeDsh(action: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const call = (command: string, values: Record<string, unknown> = {}) => this.enqueue(command, values, signal, true) as Promise<any>;
    const cdp = (method: string, values: Record<string, unknown> = {}) => call('cdp', { tabId: Number(params.tabId), method, params: values });
    const validTabs = async () => {
      const result = await call('tabs.list');
      return Array.isArray(result?.tabs) ? result.tabs.filter((tab: any) => /^https?:\/\//i.test(String(tab.url || ''))) : [];
    };
    if (action === 'tabs') return validTabs();
    if (action === 'open') {
      const url = new URL(String(params.url || ''));
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只允许打开 HTTP(S) 网页');
      const result = await call('tabs.open', { url: url.href });
      return { ...result, id: result?.tabId };
    }
    const tabId = Number(params.tabId);
    if (!Number.isInteger(tabId) || !(await validTabs()).some((tab: any) => tab.id === tabId)) throw new Error('标签页不存在或不可操作');
    if (action === 'frames') return this.frames.list(cdp);
    if (action === 'snapshot' && typeof params.frameId === 'string' && params.frameId) {
      this.refs.delete(tabId);
      return this.frames.snapshot(tabId, params.frameId, cdp);
    }
    if (action === 'snapshot') {
      this.frames.clear(tabId);
      const snapshot = await call('snapshot', { tabId, mode: 'dom', limit: 200 });
      const stamp = randomUUID();
      const refs = new Map<string, string>();
      const items = (Array.isArray(snapshot?.items) ? snapshot.items : []).filter((item: any) => /^e[0-9]+$/.test(item.ref) && String(item.type || '').toLowerCase() !== 'file').map((item: any) => {
        const ref = `${stamp}:${item.ref}`;
        refs.set(ref, String(item.type || '').toLowerCase());
        return { ref, role: item.role || item.tag, label: item.name, type: item.type };
      });
      const fileResult = await cdp('Runtime.evaluate', { expression: `(() => { const nodes = [...document.querySelectorAll('input[type="file"]')].slice(0, 30); return nodes.map((el, i) => { el.setAttribute('data-neo-upload-ref', String(i)); return { index: i, label: (el.getAttribute('aria-label') || el.name || el.id || '文件上传').slice(0, 120) }; }); })()`, returnByValue: true });
      for (const item of Array.isArray(fileResult?.result?.value) ? fileResult.result.value : []) {
        if (!Number.isInteger(item.index) || item.index < 0 || item.index >= 30) continue;
        const ref = `${stamp}:file${item.index}`;
        refs.set(ref, 'file');
        items.push({ ref, role: 'input', label: String(item.label || '文件上传'), type: 'file' });
      }
      this.refs.set(tabId, { stamp, items: refs });
      const content = await call('content', { tabId, mode: 'text' });
      return { url: snapshot.url, title: snapshot.title, text: String(content?.content || '').slice(0, 16000), elements: items };
    }
    if (action === 'scroll') return call('scroll', { tabId, y: Math.max(-1200, Math.min(1200, Number(params.amount) || 600)) });
    if (action === 'screenshot') {
      const result = await call('screenshot', { tabId, format: 'jpeg', quality: 70 });
      if (typeof result?.base64 !== 'string' || result.base64.length > 6 * 1024 * 1024 || !result.base64.startsWith('/9j/')) throw new Error('截图无效或超过大小限制');
      return { mimeType: 'image/jpeg', imageData: result.base64 };
    }
    if (action !== 'click' && action !== 'type' && action !== 'upload') throw new Error('不支持的浏览器操作');
    const ref = String(params.ref || '');
    if (this.frames.has(tabId, ref)) {
      if (action === 'upload' && (typeof params.stagedFile !== 'string' || !this.uploadDir || path.dirname(path.dirname(params.stagedFile)) !== this.uploadDir)) throw new Error('文件上传参数无效');
      return this.frames.action(tabId, action, ref, String(params.text || ''), params.stagedFile as string | undefined, cdp);
    }
    const saved = this.refs.get(tabId);
    if (!saved?.items.has(ref)) throw new Error('元素引用已失效，请重新读取页面');
    if (action === 'upload') {
      const match = /^file([0-9]+)$/.exec(ref.split(':')[1] || '');
      if (saved.items.get(ref) !== 'file' || !match || typeof params.stagedFile !== 'string' || !this.uploadDir || path.dirname(path.dirname(params.stagedFile)) !== this.uploadDir) throw new Error('文件上传参数无效');
      const doc = await cdp('DOM.getDocument', { depth: 0 });
      const found = await cdp('DOM.querySelector', { nodeId: doc?.root?.nodeId, selector: `input[type="file"][data-neo-upload-ref="${match[1]}"]` });
      if (!found?.nodeId) throw new Error('文件输入框已失效，请重新读取页面');
      await cdp('DOM.setFileInputFiles', { nodeId: found.nodeId, files: [params.stagedFile] });
      return { selected: true, fileName: path.basename(params.stagedFile) };
    }
    if (action === 'type' && ['password', 'file'].includes(saved.items.get(ref) || '')) throw new Error('不支持填写密码或上传文件');
    const element = ref.split(':')[1];
    const selector = `[data-dsh-ref="${element}"]${action === 'type' ? ':not([type="password"]):not([type="file"])' : ''}`;
    return action === 'click' ? call('click', { tabId, selector }) : call('input', { tabId, selector, value: String(params.text || '').slice(0, 10000) });
  }

  private finish(id: string, error?: Error, result?: unknown) {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    this.queue = this.queue.filter(item => item.id !== id);
    clearTimeout(entry.timer);
    if (entry.abort) entry.signal?.removeEventListener('abort', entry.abort);
    if (error) entry.reject(error); else entry.resolve(result);
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const reply = (code: number, value: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const tokenBytes = Buffer.from(token);
    const secretBytes = Buffer.from(this.secret);
    const origin = req.headers.origin;
    if (req.headers.host !== `127.0.0.1:${this.port}` || (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) || !secretBytes.length || tokenBytes.length !== secretBytes.length || !timingSafeEqual(tokenBytes, secretBytes)) {
      reply(403, { error: 'Forbidden' }); return;
    }
    if (req.method === 'GET' && req.url === '/next') {
      this.lastSeen = Date.now();
      reply(200, { command: this.queue.shift() || null }); return;
    }
    const uploadMatch = /^\/upload\/([a-f0-9]{48})$/.exec(req.url || '');
    if (req.method === 'GET' && uploadMatch) {
      const file = this.uploads.get(uploadMatch[1]);
      if (!file) { reply(404, { error: 'Not found' }); return; }
      this.uploads.delete(uploadMatch[1]);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
      return;
    }
    if (req.method !== 'POST' || req.url !== '/result') { reply(404, { error: 'Not found' }); return; }
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 8 * 1024 * 1024) { reply(413, { error: 'Too large' }); return; }
      }
      const message = JSON.parse(body);
      if (typeof message.id !== 'string' || typeof message.ok !== 'boolean') throw new Error('Invalid response');
      this.lastSeen = Date.now();
      this.finish(message.id, message.ok ? undefined : new Error(String(message.error || '浏览器操作失败').slice(0, 500)), message.result);
      reply(200, { ok: true });
    } catch { if (!res.headersSent) reply(400, { error: 'Invalid response' }); }
  }
}

export const browserBridge = new BrowserBridge();
