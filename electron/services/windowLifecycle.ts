import type { App, BrowserWindow } from 'electron';

interface WindowLifecycleOptions {
  app: App;
  platform: NodeJS.Platform;
  getWindow: () => BrowserWindow | null;
  createWindow: () => void;
  onQuit: () => void;
}

export function configureWindowLifecycle(options: WindowLifecycleOptions) {
  const { app, platform, getWindow, createWindow, onQuit } = options;
  let quitting = false;
  let cleanedUp = false;

  const beginQuit = () => {
    quitting = true;
    if (!cleanedUp) {
      cleanedUp = true;
      onQuit();
    }
  };

  const showWindow = () => {
    if (quitting) return;
    const window = getWindow();
    if (!window || window.isDestroyed()) {
      createWindow();
      return;
    }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };

  app.on('before-quit', beginQuit);
  app.on('activate', showWindow);
  app.on('window-all-closed', () => {
    if (platform !== 'darwin' && !quitting) app.quit();
  });

  const registerWindow = (window: BrowserWindow) => {
    window.on('close', (event) => {
      if (quitting) return;

      // macOS Dock 的“退出”先触发 before-quit；普通关窗只隐藏，保留对话和 Dock 入口。
      if (platform === 'darwin') {
        event.preventDefault();
        window.hide();
        return;
      }

      // Windows / Linux 保留任务栏窗口；收起后从任务栏选择“关闭窗口”才退出。
      event.preventDefault();
      if (window.isMinimized()) app.quit();
      else window.minimize();
    });

    // 系统注销 / 关机不会总是触发 app.before-quit，不应被关窗常驻逻辑阻止。
    window.on('query-session-end', beginQuit);
    window.on('session-end', beginQuit);
  };

  return { registerWindow, showWindow };
}
