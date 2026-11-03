import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { parseAccessCommand, isRestrictedRole, isRestrictedSkill, type RestrictedFeatureStatus } from '../../shared/restrictedFeatures';

const hidden: RestrictedFeatureStatus = { visible: false };
const AccessContext = createContext({ status: hidden });

/** Called before chat serialization or terminal history/shell execution. */
export async function consumeAccessCommand(input: string): Promise<boolean> {
  const action = parseAccessCommand(input);
  if (action === null) return false;
  await window.neoApi?.restrictedAccessCommand?.(action);
  return true;
}

export function useRestrictedFeatures() {
  const { status } = useContext(AccessContext);
  return {
    visible: status.visible,
    isRoleVisible: (id?: string) => !isRestrictedRole(id) || status.visible,
    isSkillVisible: (id?: string) => !isRestrictedSkill(id) || status.visible,
  };
}

export const RestrictedFeaturesProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [status, setStatus] = useState<RestrictedFeatureStatus>(hidden);
  const [isOpen, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => { setOpen(false); setPassword(''); setError(''); }, []);

  useEffect(() => {
    let active = true;
    let revision = 0;
    const offStatus = window.neoApi?.onRestrictedAccessChanged?.((next) => {
      revision++;
      if (active) { setStatus(next); close(); }
    });
    const offPrompt = window.neoApi?.onRestrictedAccessPrompt?.(() => {
      if (active) { setPassword(''); setError(''); setOpen(true); }
    });
    const initialRevision = revision;
    window.neoApi?.restrictedAccessStatus?.().then((next) => {
      if (active && revision === initialRevision) setStatus(next);
    }).catch(() => {});
    return () => { active = false; offStatus?.(); offPrompt?.(); };
  }, [close]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, busy, close]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !password.trim()) return;
    setBusy(true);
    setError('');
    const input = password;
    setPassword('');
    try {
      const result = await window.neoApi.restrictedAccessUnlock(input);
      setStatus(result.status);
      if (result.success) close();
      else setError(result.message || '验证未通过');
    } catch {
      setError('验证失败，请稍后重试');
    } finally { setBusy(false); }
  };

  return <AccessContext.Provider value={{ status }}>
    {children}
    {isOpen && <div className="fixed inset-0 z-[100] bg-slate-900/40 flex items-center justify-center p-4" onClick={() => { if (!busy) close(); }}>
      <form role="dialog" aria-modal="true" aria-label="访问验证" onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <div className="text-sm font-semibold text-slate-800">访问验证</div>
        <input aria-label="密钥" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="off" spellCheck={false} disabled={busy} maxLength={8192} placeholder="请输入密钥" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-500" />
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 text-xs">
          <button type="button" disabled={busy} onClick={close} className="px-3 py-2 rounded-lg hover:bg-slate-100">取消</button>
          <button type="submit" disabled={busy || !password.trim()} className="px-3 py-2 rounded-lg bg-sky-600 text-white disabled:opacity-50">{busy ? '验证中…' : '验证'}</button>
        </div>
      </form>
    </div>}
  </AccessContext.Provider>;
};
