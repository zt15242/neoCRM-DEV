let generation = 0;
let timer;
let running = false;
let connectionState = 'disconnected';
async function loop(epoch) {
  if (epoch !== generation) return;
  const { port, token } = await chrome.storage.local.get(['port', 'token']);
  if (!port || !token || epoch !== generation) { if (epoch === generation) { running = false; connectionState = 'disconnected'; } return; }
  try {
    const base = `http://127.0.0.1:${port}`;
    const headers = { Authorization: `Bearer ${token}` };
    const response = await fetch(`${base}/next`, { headers, cache: 'no-store' });
    if (!response.ok) throw new Error('bridge unavailable');
    if (epoch !== generation) return;
    connectionState = 'connected';
    const { command } = await response.json();
    if (command && epoch === generation) {
      let result;
      try { result = { id: command.id, ok: true, result: await execute(command.action, command.params, { base, headers }) }; }
      catch (error) { result = { id: command.id, ok: false, error: String(error.message || error) }; }
      if (epoch === generation) await fetch(`${base}/result`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(result) });
    }
  } catch { if (epoch === generation) connectionState = 'waiting'; }
  if (epoch === generation) timer = setTimeout(() => loop(epoch), 1000);
}
function restart() { generation++; clearTimeout(timer); running = true; connectionState = 'waiting'; void loop(generation); }
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'connect' || message?.type === 'disconnect') restart();
  if (message?.type === 'status') { sendResponse({ state: connectionState }); }
});
chrome.alarms.create('reconnect', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'reconnect' && !running) restart(); });
chrome.runtime.onStartup.addListener(restart);
restart();

async function execute(action, params, connection) {
  if (action === 'tabs') {
    const tabs = await chrome.tabs.query({});
    return tabs.filter(t => !t.incognito && /^https?:\/\//i.test(t.url || '')).map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active }));
  }
  if (action === 'open') {
    const url = new URL(String(params.url || ''));
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只允许打开 HTTP(S) 网页');
    const tab = await chrome.tabs.create({ url: url.href });
    return { id: tab.id, url: tab.url || url.href };
  }
  const tabId = Number(params.tabId);
  if (!Number.isInteger(tabId) || tabId < 0) throw new Error('缺少有效的标签页 ID');
  const tab = await chrome.tabs.get(tabId);
  if (tab.incognito || !/^https?:\/\//i.test(tab.url || '')) throw new Error('不能操作此标签页');
  if (action === 'frames') {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    return (frames || []).filter(frame => /^https?:\/\//i.test(frame.url || '')).map(frame => ({ id: String(frame.frameId), parentId: frame.parentFrameId < 0 ? undefined : String(frame.parentFrameId), url: frame.url }));
  }
  if (action === 'screenshot') {
    if (!tab.active) throw new Error('截图前请先激活该标签页');
    if (!await chrome.permissions.contains({ origins: ['<all_urls>'] })) throw new Error('浏览器截图权限尚未授予。请在 Chrome 扩展管理中重新加载 NeoCRM 浏览器助手，并确认网站访问权限为“在所有网站上”。');
    const isTargetActive = async () => {
      const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
      return active?.id === tabId && !active.incognito && /^https?:\/\//i.test(active.url || '') && active.url === tab.url && (!active.pendingUrl || active.pendingUrl === active.url);
    };
    if (!await isTargetActive()) throw new Error('目标标签页已切换或正在跳转，请返回该页面后重试');
    let data;
    try { data = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 }); }
    catch (error) {
      if (/all_urls|activeTab|permission/i.test(String(error?.message || error))) throw new Error('浏览器截图权限不足。请重新加载 NeoCRM 浏览器助手，并确认网站访问权限为“在所有网站上”。');
      throw error;
    }
    if (!await isTargetActive()) throw new Error('截图期间标签页已切换，画面已丢弃；请返回目标页面重试');
    const imageData = data.replace(/^data:image\/jpeg;base64,/, '');
    if (imageData.length > 6 * 1024 * 1024 || !imageData.startsWith('/9j/')) throw new Error('截图无效或超过大小限制');
    return { mimeType: 'image/jpeg', imageData };
  }
  if (!['snapshot', 'click', 'type', 'scroll', 'upload'].includes(action)) throw new Error('不支持的浏览器操作');
  let frameId = 0;
  let documentId;
  if (action === 'snapshot' && params.frameId !== undefined && params.frameId !== '') {
    frameId = Number(params.frameId);
    if (!Number.isInteger(frameId) || frameId < 0) throw new Error('框架 ID 无效');
  } else if (['click', 'type', 'upload'].includes(action) && String(params.ref || '').startsWith('frame/')) {
    const match = /^frame\/(\d+)\/([a-f0-9-]+)\/(.+)$/i.exec(String(params.ref));
    if (!match) throw new Error('框架元素引用无效');
    frameId = Number(match[1]); documentId = match[2]; params = { ...params, ref: match[3] };
  }
  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  const frame = (frames || []).find(item => item.frameId === frameId && /^https?:\/\//i.test(item.url || ''));
  if (!frame || (documentId && frame.documentId !== documentId)) throw new Error('框架已变化或无法访问，请重新读取框架');
  if (action === 'upload') {
    if (!/^[a-f0-9]{48}$/.test(String(params.uploadId || ''))) throw new Error('上传标识无效');
    const response = await fetch(`${connection.base}/upload/${params.uploadId}`, { headers: connection.headers, cache: 'no-store' });
    if (!response.ok) throw new Error('无法读取授权的上传文件');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 50 * 1024 * 1024) throw new Error('上传文件超过 50 MB');
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    params = { ...params, fileData: btoa(binary) };
  }
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId, documentIds: [frame.documentId] }, func: pageAction, args: [action, params] });
  if (result && typeof result.__neoError === 'string') throw new Error(result.__neoError);
  if (!result || typeof result !== 'object') throw new Error('页面未返回操作结果，请重新读取页面');
  if (action === 'snapshot') return { ...result, frameId: String(frameId), elements: result.elements.map(item => ({ ...item, ref: `frame/${frameId}/${frame.documentId}/${item.ref}` })) };
  return result;
}
function pageAction(action, params) {
  try {
  const targets = () => Array.from(document.querySelectorAll('a[href],button,input:not([type=hidden]),textarea,select,[role=button],[role=link],[contenteditable=true]')).filter(el => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return el.matches('input[type=file]') || (r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none');
  });
  if (action === 'snapshot') {
    const stamp = crypto.randomUUID();
    window.__neoBrowserRefs = { stamp, elements: targets() };
    const elements = window.__neoBrowserRefs.elements.slice(0, 200).map((el, index) => ({ ref: `${stamp}:${index}`, role: el.getAttribute('role') || el.tagName.toLowerCase(), label: (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.getAttribute('title') || '').trim().slice(0, 180), type: el.getAttribute('type') || undefined }));
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,input,textarea,select').forEach(el => el.remove());
    return { url: location.href, title: document.title, text: (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').slice(0, 16000), elements };
  }
  if (action === 'scroll') { window.scrollBy(0, Math.max(-1200, Math.min(1200, Number(params.amount) || 600))); return { scrollY: window.scrollY }; }
  const [stamp, index] = String(params.ref || '').split(':');
  const refs = window.__neoBrowserRefs;
  const el = refs && refs.stamp === stamp ? refs.elements[Number(index)] : null;
  if (!el || !el.isConnected) throw new Error('元素引用已失效，请重新读取页面');
  if (action === 'upload') {
    if (!el.matches('input[type=file]')) throw new Error('请选择文件输入框');
    const raw = atob(String(params.fileData || ''));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const transfer = new DataTransfer();
    const fileName = String(params.fileName || 'upload');
    const extension = fileName.split('.').pop().toLowerCase();
    const mime = { zip: 'application/zip', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', json: 'application/json', html: 'text/html', xml: 'application/xml', js: 'text/javascript', css: 'text/css', txt: 'text/plain', csv: 'text/csv', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }[extension] || 'application/octet-stream';
    transfer.items.add(new File([bytes], fileName, { type: mime }));
    el.files = transfer.files;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { selected: true, fileName: String(params.fileName || 'upload'), synthetic: true };
  }
  if (action === 'click') { if (el.matches('input[type=file]')) throw new Error('此扩展暂不支持文件上传，请使用 DSH 扩展'); el.click(); return { clicked: true, synthetic: true }; }
  if (el.matches('input[type=password],input[type=file]')) throw new Error('不支持填写密码或上传文件');
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable)) throw new Error('该元素不是输入框');
  el.focus();
  const value = String(params.text || '').slice(0, 10000);
  if (el.isContentEditable) el.textContent = value;
  else { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); }
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  return { typed: true };
  } catch (error) { return { __neoError: String(error && error.message || error).slice(0, 500) }; }
}
