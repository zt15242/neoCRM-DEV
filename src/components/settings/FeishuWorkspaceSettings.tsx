import React, { useEffect, useState } from 'react';
import { Plus, Send, ShieldCheck, Trash2 } from 'lucide-react';
import type { FeishuWorkspaceSettings as Config } from '../../../shared/feishuTypes';

interface Props { showToast: (type: 'success' | 'error' | 'info', text: string) => void; }

export const FeishuWorkspaceSettings: React.FC<Props> = ({ showToast }) => {
  const [config, setConfig] = useState<Config>({ configured: false, bots: [] });
  const [name, setName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyBotId, setBusyBotId] = useState<string | null>(null);

  const load = async () => {
    const saved = await window.neoApi.feishuGetSettings?.();
    setConfig(saved || { configured: false, bots: [] });
  };

  useEffect(() => { void load().catch((error: any) => showToast('error', error?.message || '加载飞书配置失败')); }, []);

  const add = async () => {
    setBusy(true);
    try {
      const next = await window.neoApi.feishuAddBot?.({ name, webhookUrl });
      if (next) setConfig(next);
      setName('');
      setWebhookUrl('');
      showToast('success', '飞书机器人已添加');
    } catch (error: any) { showToast('error', error?.message || '添加飞书机器人失败'); }
    finally { setBusy(false); }
  };

  const test = async (botId: string) => {
    setBusyBotId(botId);
    try {
      await window.neoApi.feishuTestMessage?.(botId);
      showToast('success', '测试看板卡片已发送到对应群聊');
    } catch (error: any) { showToast('error', error?.message || '飞书测试消息发送失败'); }
    finally { setBusyBotId(null); }
  };

  const remove = async (botId: string) => {
    const bot = config.bots.find((item) => item.id === botId);
    if (!bot || !window.confirm(`确定移除飞书机器人“${bot.name}”吗？如果仍有订阅使用该机器人，系统会阻止移除。`)) return;
    setBusyBotId(botId);
    try {
      const next = await window.neoApi.feishuRemoveBot?.(botId);
      if (next) setConfig(next);
      showToast('success', '飞书机器人已移除');
    } catch (error: any) { showToast('error', error?.message || '移除飞书机器人失败'); }
    finally { setBusyBotId(null); }
  };

  return <div className="max-w-3xl space-y-5 text-sm">
    <div className="border-b border-slate-200 pb-3"><h3 className="text-base font-semibold text-slate-900">飞书机器人</h3><p className="mt-1 text-xs text-slate-500">可连接多个群机器人，并在每个工作台组件的订阅设置中选择推送目标。</p></div>
    <section className="space-y-3">
      <h4 className="text-xs font-semibold text-slate-700">已连接 · {config.bots.length}</h4>
      {config.bots.length === 0 ? <p className="rounded border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500">尚未添加飞书机器人</p> : config.bots.map((bot) => <div key={bot.id} className="flex items-center gap-3 rounded border border-slate-200 px-3 py-3">
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{bot.name}</p><p className="mt-0.5 text-xs text-slate-500">Webhook 已加密保存在本机</p></div>
        <button disabled={busy || busyBotId === bot.id} onClick={() => void test(bot.id)} title="发送测试看板卡片" className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-2.5 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Send size={13}/>测试</button>
        <button disabled={busy || busyBotId === bot.id} onClick={() => void remove(bot.id)} title="移除机器人" className="rounded p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"><Trash2 size={15}/></button>
      </div>)}
    </section>
    <section className="space-y-3 border-t border-slate-200 pt-4">
      <h4 className="text-xs font-semibold text-slate-700">添加机器人</h4>
      <label className="block text-xs font-medium text-slate-700">显示名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：运维看板群" maxLength={60} className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"/></label>
      <label className="block text-xs font-medium text-slate-700">群机器人 Webhook<input type="password" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="粘贴飞书自定义机器人 HTTPS Webhook" className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"/></label>
      <div className="flex items-start gap-2 text-xs text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600"/><span>Webhook 在本机系统安全存储中加密保存，不会在界面或日志中回显。测试消息会真实发送到对应群聊。</span></div>
      <button disabled={busy || !name.trim() || !webhookUrl.trim()} onClick={() => void add()} className="inline-flex items-center gap-1.5 rounded bg-sky-700 px-3 py-2 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50"><Plus size={14}/>{busy ? '处理中…' : '添加机器人'}</button>
    </section>
  </div>;
};
