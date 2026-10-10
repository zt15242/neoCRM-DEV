import React, { useState } from 'react';
import { 
  Server, 
  Globe, 
  Plus, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  Activity, 
  Lock, 
  Sparkles
} from 'lucide-react';
import { NeoEnvironment, TestConnectionResult } from '../../shared/types';

interface EnvironmentSelectorProps {
  environments: NeoEnvironment[];
  selectedEnvId: string;
  onSelect: (envId: string) => void;
  onAddCustom: () => void;
  onEditCustom: (env: NeoEnvironment) => void;
  onDeleteCustom: (envId: string) => void;
}

export const EnvironmentSelector: React.FC<EnvironmentSelectorProps> = ({
  environments,
  selectedEnvId,
  onSelect,
  onAddCustom,
  onEditCustom,
  onDeleteCustom,
}) => {
  const [pingResults, setPingResults] = useState<Record<string, TestConnectionResult>>({});
  const [isPinging, setIsPinging] = useState<Record<string, boolean>>({});

  const handlePing = async (e: React.MouseEvent, env: NeoEnvironment) => {
    e.stopPropagation();
    setIsPinging((prev) => ({ ...prev, [env.id]: true }));
    try {
      const res = await window.neoApi.testConnectivity(env.neoBaseURL);
      setPingResults((prev) => ({ ...prev, [env.id]: res }));
    } catch {
      setPingResults((prev) => ({
        ...prev,
        [env.id]: { success: false, message: '网络探测失败' },
      }));
    } finally {
      setIsPinging((prev) => ({ ...prev, [env.id]: false }));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Server className="w-4 h-4 text-sky-600" />
          <h2 className="text-sm font-semibold text-slate-800 tracking-wide">
            目标环境选择
          </h2>
          <span className="text-xs text-slate-500">
            (共 {environments.length} 个可用环境)
          </span>
        </div>
        <button
          onClick={onAddCustom}
          className="flex items-center space-x-1 text-xs text-sky-600 hover:text-sky-700 font-medium px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-all shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>添加自定义环境</span>
        </button>
      </div>

      {/* 环境卡片网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {environments.map((env) => {
          const isSelected = env.id === selectedEnvId;
          const ping = pingResults[env.id];
          const pinging = isPinging[env.id];

          return (
            <div
              key={env.id}
              onClick={() => onSelect(env.id)}
              className={`group relative p-4 rounded-xl border text-left cursor-pointer transition-all duration-200 select-none ${
                isSelected
                  ? 'bg-sky-50/60 border-sky-500 shadow-sm ring-1 ring-sky-500'
                  : 'bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs ${
                      isSelected
                        ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {env.isPreset ? <Globe className="w-4 h-4" /> : <Sparkles className="w-4 h-4 text-amber-500" />}
                  </div>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <h3 className="font-semibold text-sm text-slate-900 group-hover:text-sky-600 transition-colors">
                        {env.name}
                      </h3>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-sky-600 flex-shrink-0" />
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      ID: {env.id}
                    </span>
                  </div>
                </div>

                {/* 预设标签 / 自定义操作菜单 */}
                <div className="flex items-center space-x-1">
                  {env.isPreset ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                      官方预置
                    </span>
                  ) : (
                    <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onEditCustom(env)}
                        className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition-colors"
                        title="编辑环境"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteCustom(env.id)}
                        className="p-1 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded transition-colors"
                        title="删除环境"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 地址与描述 */}
              <p className="text-xs text-slate-500 truncate mb-2.5 font-mono" title={env.neoBaseURL}>
                {env.neoBaseURL}
              </p>

              {/* 底部测速与状态 */}
              <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-[11px]">
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={(e) => handlePing(e, env)}
                    disabled={pinging}
                    className="flex items-center space-x-1 text-slate-500 hover:text-slate-800 transition-colors"
                    title="探测网络延迟"
                  >
                    <Activity className={`w-3 h-3 ${pinging ? 'animate-spin text-sky-600' : ''}`} />
                    <span>
                      {pinging ? '测速中...' : ping ? `${ping.responseTimeMs}ms` : '探测延迟'}
                    </span>
                  </button>
                  {ping && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        ping.success ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    />
                  )}
                </div>

                <div className="text-[10px] text-slate-500 flex items-center space-x-1 font-medium">
                  <Lock className="w-2.5 h-2.5" />
                  <span>OAuth2</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
