import React, { useEffect, useState } from 'react';
import { Send, ShieldCheck } from 'lucide-react';
import type { FeishuWorkspaceSettings as Config } from '../../../shared/feishuTypes';

interface Props { showToast: (type: 'success' | 'error' | 'info', text: string) => void; }

export const FeishuWorkspaceSettings: React.FC<Props> = ({ showToast }) => {
  const [config, setConfig] = useState<Config>({ configured: false });
  const [webhookUrl, setWebhookUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const saved = await window.neoApi.feishuGetSettings?.();
    setConfig(saved || { configured: false });
  };

  useEffect(() => { void load().catch((error: any) => showToast('error', error?.message || '加载飞书配置失败')); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const next = await window.neoApi.feishuSaveSettings?.({ webhookUrl });
      if (next) setConfig(next);
      setWebhookUrl('');
      showToast('success', '飞书机器人配置已保存');
    } catch (error: any) { showToast('error', error?.message || '保存飞书配置失败'); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    try {
      await window.neoApi.feishuTestMessage?.();
      showToast('success', '测试消息已发送到机器人对应群聊');
    } catch (error: any) { showToast('error', error?.message || '飞书测试消息发送失败'); }
    finally { setBusy(false); }
  };

  return <div className="max-w-3xl space-y-5 text-sm">
    <div className="border-b border-slate-200 pb-3"><h3 className="text-base font-semibold text-slate-900">飞书机器人</h3><p className="mt-1 text-xs text-slate-500">配置全局机器人凭据。是否订阅、运行频率和是否推送，在每个工作台组件的设置中单独管理。</p></div>
    <section className="space-y-4">
      <label className="block text-xs font-medium text-slate-700">群机器人 Webhook</label>
      <input type="password" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder={config.configured ? '已加密保存，留空保持不变；输入新地址可替换' : '粘贴飞书自定义机器人 HTTPS Webhook'} className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500" />
      <div className="flex items-start gap-2 text-xs text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600"/><span>Webhook 在本机系统安全存储中加密保存，界面和日志不会回显完整地址。测试消息会真实发送到该机器人所在群聊。</span></div>
      <div className="flex items-center gap-2">
        <button disabled={!config.configured || busy} onClick={() => void test()} className="inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Send size={14}/>发送测试消息</button>
        <button disabled={busy || !webhookUrl.trim()} onClick={() => void save()} className="rounded bg-sky-700 px-4 py-2 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50">{busy ? '处理中…' : '保存 Webhook'}</button>
        <span className="text-xs text-slate-500">{config.configured ? '已配置' : '尚未配置'}</span>
      </div>
    </section>
  </div>;
};
