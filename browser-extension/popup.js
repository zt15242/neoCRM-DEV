const token = document.getElementById('token');
const feedback = document.getElementById('feedback');
const title = document.getElementById('status-title');
const description = document.getElementById('status-description');
const connection = document.querySelector('.connection');
const pairing = document.getElementById('pairing');
const intro = document.getElementById('intro');
const connect = document.getElementById('connect');
const disconnect = document.getElementById('disconnect');
let savedToken = '';
let manuallyOpened = false;

document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;
pairing.addEventListener('toggle', () => { if (pairing.open) manuallyOpened = true; });

async function refresh() {
  try {
    const stored = await chrome.storage.local.get(['token']);
    savedToken = stored.token || '';
    const response = await chrome.runtime.sendMessage({ type: 'status' });
    const state = savedToken ? (response?.state || 'waiting') : 'disconnected';
    connection.dataset.state = state;
    title.textContent = state === 'connected' ? '已连接' : state === 'waiting' ? '等待连接' : '未连接';
    description.textContent = state === 'connected' ? '浏览器助手已准备就绪' : state === 'waiting' ? '请确认桌面端已开启浏览器控制' : '完成配对后即可使用浏览器助手';
    disconnect.hidden = !savedToken;
    intro.hidden = Boolean(savedToken);
    if (savedToken && !manuallyOpened) pairing.open = false;
  } catch {
    connection.dataset.state = 'waiting';
    title.textContent = '连接状态不可用';
    description.textContent = '请重新打开扩展，或检查桌面端状态';
  }
}

(async () => {
  const stored = await chrome.storage.local.get(['token']);
  token.value = stored.token || '';
  pairing.open = !stored.token;
  manuallyOpened = false;
  await refresh();
})();

connect.addEventListener('click', async () => {
  const value = token.value.trim();
  if (!/^[0-9a-f]{64}$/.test(value)) { feedback.textContent = '配对码不正确，请从桌面端重新复制。'; token.focus(); return; }
  feedback.textContent = '';
  connect.disabled = true;
  try {
    await chrome.storage.local.set({ port: 39877, token: value });
    await chrome.runtime.sendMessage({ type: 'connect' });
    manuallyOpened = false;
    pairing.open = false;
    await refresh();
  } catch { feedback.textContent = '保存失败，请重试。'; }
  finally { connect.disabled = false; }
});
disconnect.addEventListener('click', async () => {
  try {
    await chrome.storage.local.clear();
    await chrome.runtime.sendMessage({ type: 'disconnect' });
    token.value = '';
    feedback.textContent = '';
    manuallyOpened = false;
    pairing.open = true;
    await refresh();
  } catch { feedback.textContent = '断开失败，请重试。'; }
});
setInterval(refresh, 2000);
