import React, { useState } from 'react';
import { AiHarnessSettings } from '../../../shared/types';
import { 
  Sliders, 
  Trash2, 
  RefreshCw, 
  Check, 
  Info,
  ShieldCheck,
  HardDrive
} from 'lucide-react';

interface GeneralSettingsProps {
  settings: AiHarnessSettings;
  onSaveSettings: (newSettings: Partial<AiHarnessSettings>) => Promise<void>;
  onClearAiSessions: () => Promise<void>;
  onCheckUpdate: () => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  settings,
  onSaveSettings,
  onClearAiSessions,
  onCheckUpdate,
  showToast,
}) => {
  const [startupTab, setStartupTab] = useState(settings.defaultStartupTab || 'dashboard');
  const [sqlLimit, setSqlLimit] = useState(settings.defaultSqlLimit || 100);
  const [clearing, setClearing] = useState(false);

  const handleSave = async () => {
    try {
      await onSaveSettings({
        defaultStartupTab: startupTab as any,
        defaultSqlLimit: sqlLimit,
      });
      showToast('success', '工作台通用偏好已保存');
    } catch (e: any) {
      showToast('error', `保存失败: ${e.message}`);
    }
  };

  const handleClearSessions = async () => {
    if (!window.confirm('确定要清空全部 AI 历史对话记录吗？此操作不可撤销。')) return;
    setClearing(true);
    try {
      await onClearAiSessions();
      showToast('info', '所有历史 AI 对话已清空');
    } catch (e: any) {
      showToast('error', `清空失败: ${e.message}`);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="pb-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800">通用与工作台偏好 (General Preferences)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            配置工作台启动行为、DML 请求头安全规范与本地存储维护。
          </p>
        </div>
        <button
          onClick={handleSave}
          className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs"
        >
          保存通用设置
        </button>
      </div>

      {/* 工作台基础选项 */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-4">
        <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm">
          <Sliders className="w-4 h-4 text-sky-600" />
          <span>工作台偏好</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-600 font-medium mb-1">
              应用启动时默认展示页面
            </label>
            <select
              value={startupTab}
              onChange={(e) => setStartupTab(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:border-sky-500"
            >
              <option value="dashboard">控制台 & 会话 (默认)</option>
              <option value="metadata">对象与字段管理</option>
              <option value="data">数据中心 (DML)</option>
              <option value="ai">AI 智能助手 (Harness Studio)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">
              SQL 探索器默认单次限制条数 (LIMIT)
            </label>
            <input
              type="number"
              min={20}
              max={1000}
              step={20}
              value={sqlLimit}
              onChange={(e) => setSqlLimit(Number(e.target.value) || 100)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono"
            />
          </div>
        </div>
      </div>

      {/* DML 请求头信息展示 */}
      <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 space-y-2">
        <div className="flex items-center space-x-2 text-emerald-800 font-bold text-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>销售易 DML 执行请求头规范 (系统已全局内置)</span>
        </div>
        <p className="text-emerald-700 leading-relaxed text-[11px]">
          为确保拜访、商机、工单等复杂业务对象在新增与更新时触发销售易完整系统校验与流程，数据中心已全局强制携带以下请求头：
        </p>
        <pre className="p-3 rounded-xl bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto">
{`xsy-execoption: -1025
xsy-criteria: 10
xsy-inner-source: bff`}
        </pre>
      </div>

      {/* 缓存与存储维护 */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
        <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm">
          <HardDrive className="w-4 h-4 text-slate-600" />
          <span>本地存储与维护</span>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div>
            <div className="font-semibold text-slate-800">清空所有 AI 对话记录</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              清除本地 neocrm_ai_sessions.json 中存储的所有历史对话消息
            </div>
          </div>
          <button
            onClick={handleClearSessions}
            disabled={clearing}
            className="px-3.5 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-medium flex items-center space-x-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{clearing ? '清空中...' : '清空 AI 会话'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div>
            <div className="font-semibold text-slate-800">检查软件版本更新</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              当前版本: v1.2.7（通过国内 CDN 加速自动检测）
            </div>
          </div>
          <button
            onClick={onCheckUpdate}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center space-x-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>检查最新版本</span>
          </button>
        </div>
      </div>
    </div>
  );
};
