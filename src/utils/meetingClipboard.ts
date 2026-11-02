export async function copyMeetingText(text: string): Promise<void> {
  if (!text.trim()) throw new Error('没有可以复制的内容');
  try {
    if (window.neoApi?.clipboardWriteText && await window.neoApi.clipboardWriteText(text)) return;
  } catch { /* Try the browser clipboard when the native bridge is unavailable. */ }
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* Try legacy copy. */ }
  }
  const previous = document.activeElement as HTMLElement | null;
  const field = document.createElement('textarea');
  field.value = text;
  field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.appendChild(field);
  try {
    field.focus();
    field.select();
    if (!document.execCommand('copy')) throw new Error('剪贴板不可用，请选中文本后复制');
  } finally {
    field.remove();
    previous?.focus();
  }
}
