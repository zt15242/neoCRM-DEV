import { randomUUID } from 'node:crypto';

type Cdp = (method: string, params?: Record<string, unknown>) => Promise<any>;
interface FrameRefs { contextId: number; refs: Map<string, { token: string; type: string }> }

/** Browser frames are identified by Chrome's frame IDs; element tokens belong to one snapshot. */
export class BrowserFrameController {
  private tabs = new Map<number, FrameRefs>();
  clear(tabId?: number) { if (tabId === undefined) this.tabs.clear(); else this.tabs.delete(tabId); }

  async list(cdp: Cdp) {
    const tree = await cdp('Page.getFrameTree');
    const frames: Array<{ id: string; parentId?: string; url: string; name?: string }> = [];
    const visit = (node: any, parentId?: string) => {
      const frame = node?.frame;
      if (!frame || typeof frame.id !== 'string') return;
      frames.push({ id: frame.id, parentId, url: String(frame.url || ''), name: frame.name });
      for (const child of node.childFrames || []) visit(child, frame.id);
    };
    visit(tree?.frameTree);
    return frames.slice(0, 100);
  }

  async snapshot(tabId: number, frameId: string, cdp: Cdp) {
    this.clear(tabId);
    if (!(await this.list(cdp)).some(frame => frame.id === frameId)) throw new Error('框架不存在或已变化，请重新列出框架');
    let contextId: number;
    try {
      const world = await cdp('Page.createIsolatedWorld', { frameId, worldName: 'NeoCRM browser control', grantUniveralAccess: false });
      contextId = world.executionContextId;
      if (!Number.isInteger(contextId)) throw new Error('无法创建框架上下文');
    } catch { throw new Error('无法访问该框架；跨进程或受浏览器限制的框架暂不支持'); }
    const stamp = randomUUID();
    const expression = `(() => {
      const stamp = ${JSON.stringify(stamp)};
      const selector = 'a[href],button,input:not([type=hidden]),textarea,select,[role=button],[role=link],[contenteditable=true]';
      const nodes = [...document.querySelectorAll(selector)].filter(el => {
        if (el.matches('input[type=file]')) return true;
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      }).slice(0, 200);
      const items = nodes.map((el, i) => {
        const token = stamp + '-' + i;
        el.setAttribute('data-neo-frame-ref', token);
        return { token, role: el.getAttribute('role') || el.tagName.toLowerCase(), type: (el.getAttribute('type') || '').toLowerCase(), label: (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.innerText || el.name || el.id || '').trim().slice(0, 180) };
      });
      const clone = document.body?.cloneNode(true);
      clone?.querySelectorAll('script,style,noscript,input,textarea,select').forEach(el => el.remove());
      return { url: location.href, title: document.title, text: (clone?.innerText || clone?.textContent || '').replace(/\\s+/g, ' ').slice(0, 16000), items };
    })()`;
    const result = await this.evaluate(cdp, contextId, expression);
    const refs = new Map<string, { token: string; type: string }>();
    const elements = (Array.isArray(result?.items) ? result.items : []).map((item: any) => {
      if (typeof item.token !== 'string' || !item.token.startsWith(`${stamp}-`)) throw new Error('框架快照无效');
      const ref = `${stamp}:${item.token.slice(stamp.length + 1)}`;
      refs.set(ref, { token: item.token, type: String(item.type || '') });
      return { ref, role: item.role, type: item.type, label: item.label };
    });
    this.tabs.set(tabId, { contextId, refs });
    return { frameId, url: result?.url, title: result?.title, text: result?.text, elements };
  }

  has(tabId: number, ref: string) { return this.tabs.get(tabId)?.refs.has(ref) === true; }

  async action(tabId: number, action: string, ref: string, text: string, stagedFile: string | undefined, cdp: Cdp) {
    const state = this.tabs.get(tabId), item = state?.refs.get(ref);
    if (!state || !item) throw new Error('框架元素引用已失效，请重新读取框架');
    if (action === 'type' && ['password', 'file'].includes(item.type)) throw new Error('不支持填写密码或上传文件');
    if (action === 'click' && item.type === 'file') throw new Error('文件输入框请使用 upload 操作');
    if (action === 'upload' && (item.type !== 'file' || !stagedFile)) throw new Error('请选择有效的文件输入框');
    const selector = `[data-neo-frame-ref="${item.token}"]`;
    if (action === 'upload') {
      const found = await cdp('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(`input[type="file"]${selector}`)})`, contextId: state.contextId, returnByValue: false });
      if (found?.exceptionDetails || !found?.result?.objectId || found.result.subtype === 'null') throw new Error('框架文件输入框已失效');
      const node = await cdp('DOM.requestNode', { objectId: found.result.objectId });
      if (!node?.nodeId) throw new Error('无法定位框架文件输入框');
      await cdp('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [stagedFile] });
      return { selected: true };
    }
    const expression = `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el || !el.isConnected) throw new Error('框架元素引用已失效');
      const action = ${JSON.stringify(action)};
      if (action === 'click') { el.click(); return { clicked: true, synthetic: true }; }
      if (el.matches('input[type=password],input[type=file]')) throw new Error('不支持填写密码或上传文件');
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable)) throw new Error('该元素不是输入框');
      const value = ${JSON.stringify(text.slice(0, 10000))};
      el.focus();
      if (el.isContentEditable) el.textContent = value;
      else { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); }
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      return { typed: true, synthetic: true };
    })()`;
    return this.evaluate(cdp, state.contextId, expression);
  }

  private async evaluate(cdp: Cdp, contextId: number, expression: string) {
    let result: any;
    try { result = await cdp('Runtime.evaluate', { expression, contextId, returnByValue: true }); }
    catch { throw new Error('框架已变化或无法访问，请重新读取框架'); }
    if (result?.exceptionDetails) throw new Error('框架操作失败，元素可能已失效，请重新读取框架');
    return result?.result?.value;
  }
}
