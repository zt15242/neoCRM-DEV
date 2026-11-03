import type { WebContents } from 'electron';

export function configureAppPermissions(contents: WebContents, appUrl: string): void {
  const appDocument = new URL(appUrl);
  const mediaPermissions = new Set(['media', 'display-capture']);
  const allowFullscreen = (requester: WebContents | null, details: { isMainFrame: boolean; requestingUrl?: string }) => {
    if (requester !== contents || !details.isMainFrame || !details.requestingUrl) return false;
    try {
      const document = new URL(details.requestingUrl);
      return document.protocol === appDocument.protocol && document.host === appDocument.host && document.pathname === appDocument.pathname;
    } catch {
      return false;
    }
  };

  contents.session.setPermissionCheckHandler((requester, permission, _origin, details) => {
    return permission === 'fullscreen' ? allowFullscreen(requester, details) : mediaPermissions.has(permission);
  });
  contents.session.setPermissionRequestHandler((requester, permission, callback, details) => {
    callback(permission === 'fullscreen' ? allowFullscreen(requester, details) : mediaPermissions.has(permission));
  });
}
