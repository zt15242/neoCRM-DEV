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
  Sparkles,
  Cloud,
  Layers,
  Flame,
  Plug,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { NeoEnvironment, TestConnectionResult, CrmProductType } from '../../shared/types';

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
  const [activeFilter, setActiveFilter] = useState<'all' | CrmProductType>('all');
  const [pingResults, setPingResults] = useState<Record<string, TestConnectionResult>>({});
  const [isPinging, setIsPinging] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const handleCopyUrl = (e: React.MouseEvent, url: string, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 统计各产品连接器数量
  const counts = {
    all: environments.length,
    neocrm: environments.filter((e) => (e.productType || 'neocrm') === 'neocrm').length,
    salesforce: environments.filter((e) => e.productType === 'salesforce').length,
    fxiaoke: environments.filter((e) => e.productType === 'fxiaoke').length,
    custom: environments.filter((e) => e.productType === 'custom').length,
  };

  // 筛选连接器
  const filteredEnvironments = environments.filter((env) => {
    if (activeFilter === 'all') return true;
    return (env.productType || 'neocrm') === activeFilter;
  });

  // 获取各品牌专属图标与配色
  const getProductMeta = (productType?: CrmProductType) => {
    switch (productType) {
      case 'salesforce':
        return {
          label: 'Salesforce',
          icon: Cloud,
          badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200',
          iconColor: 'bg-cyan-600 text-white',
          brandColor: 'text-cyan-600',
        };
      case 'fxiaoke':
        return {
          label: '纷享销客',
          icon: Flame,
          badgeColor: 'bg-orange-50 text-orange-700 border-orange-200',
          iconColor: 'bg-orange-600 text-white',
          brandColor: 'text-orange-600',
        };
      case 'custom':
        return {
          label: '自定义 CRM',
          icon: Plug,
          badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
          iconColor: 'bg-purple-600 text-white',
          brandColor: 'text-purple-600',
        };
      case 'neocrm':
      default:
        return {
          label: '销售易 NeoCRM',
          icon: Layers,
          badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
          iconColor: 'bg-sky-600 text-white',
          brandColor: 'text-sky-600',
        };
    }
  };

  // 获取环境类型标签
  const getEnvTypeLabel = (envType?: string) => {
    switch (envType) {
      case 'production':
        return { text: '生产环境', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'sandbox':
        return { text: '沙盒演练', color: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'test':
        return { text: '开发测试', color: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'custom':
      default:
        return { text: '定制实例', color: 'bg-slate-100 text-slate-600 border-slate-200' };
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. 顶部标题栏与全局操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-xs">
              <Server className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-slate-800 tracking-wide">
              CRM 环境连接器中心 (Connectors Hub)
            </h2>
            <span className="text-xs text-slate-400 font-mono">
              (共 {environments.length} 个配置连接器)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            支持集中管理销售易、Salesforce、纷享销客等多套 CRM 环境连接器，点击卡片即可在多环境间秒级无缝切换
          </p>
        </div>

        <button
          onClick={onAddCustom}
          className="flex items-center space-x-1.5 text-xs text-white font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 transition-all shadow-xs cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>新建 CRM 连接器</span>
        </button>
      </div>

      {/* 2. 品牌与产品分类切换过滤器 (Product Tabs) */}
      <div className="flex items-center space-x-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80 text-xs select-none overflow-x-auto">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
            activeFilter === 'all'
              ? 'bg-white text-slate-900 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          全部连接器 ({counts.all})
        </button>

        <button
          onClick={() => setActiveFilter('neocrm')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
            activeFilter === 'neocrm'
              ? 'bg-white text-sky-700 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-sky-600" />
          <span>销售易 NeoCRM ({counts.neocrm})</span>
        </button>

        <button
          onClick={() => setActiveFilter('salesforce')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
            activeFilter === 'salesforce'
              ? 'bg-white text-cyan-700 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Cloud className="w-3.5 h-3.5 text-cyan-600" />
          <span>Salesforce ({counts.salesforce})</span>
        </button>

        <button
          onClick={() => setActiveFilter('fxiaoke')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
            activeFilter === 'fxiaoke'
              ? 'bg-white text-orange-700 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-orange-600" />
          <span>纷享销客 ({counts.fxiaoke})</span>
        </button>

        <button
          onClick={() => setActiveFilter('custom')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
            activeFilter === 'custom'
              ? 'bg-white text-purple-700 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Plug className="w-3.5 h-3.5 text-purple-600" />
          <span>自定义 CRM ({counts.custom})</span>
        </button>
      </div>

      {/* 3. 连接器卡片网格布局 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredEnvironments.map((env) => {
          const isSelected = env.id === selectedEnvId;
          const ping = pingResults[env.id];
          const pinging = isPinging[env.id];
          const pMeta = getProductMeta(env.productType);
          const envTypeInfo = getEnvTypeLabel(env.envType);
          const BrandIcon = pMeta.icon;

          return (
            <div
              key={env.id}
              onClick={() => onSelect(env.id)}
              className={`group relative p-4 rounded-2xl border text-left cursor-pointer transition-all duration-200 select-none flex flex-col justify-between ${
                isSelected
                  ? 'bg-gradient-to-br from-sky-50/80 via-white to-slate-50 border-sky-400 shadow-md ring-2 ring-sky-400/40'
                  : 'bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              {/* 卡片顶部：品牌图标、标题、生效状态 */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${pMeta.iconColor}`}>
                      <BrandIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5 truncate">
                        <h3 className="font-bold text-xs md:text-sm text-slate-900 truncate group-hover:text-sky-600 transition-colors">
                          {env.name}
                        </h3>
                      </div>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-medium border ${pMeta.badgeColor}`}>
                          {pMeta.label}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono border ${envTypeInfo.color}`}>
                          {envTypeInfo.text}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 状态徽标：已激活 vs 未激活 */}
                  <div className="shrink-0 flex items-center space-x-1">
                    {isSelected ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center space-x-1 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>生效中</span>
                      </span>
                    ) : env.isPreset ? (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-mono">
                        官方预置
                      </span>
                    ) : (
                      <div className="flex items-center space-x-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onEditCustom(env)}
                          className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded transition-colors"
                          title="编辑连接器配置"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onDeleteCustom(env.id)}
                          className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          title="移除连接器"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 实例服务地址 (Base URL) */}
                <div className="pt-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 bg-slate-50/80 p-2 rounded-xl border border-slate-100">
                    <span className="truncate pr-2">{env.neoBaseURL}</span>
                    <button
                      onClick={(e) => handleCopyUrl(e, env.neoBaseURL, env.id)}
                      title="复制服务地址"
                      className="p-1 hover:bg-white rounded text-slate-400 hover:text-slate-700 shrink-0 transition-colors cursor-pointer"
                    >
                      {copiedId === env.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {/* 描述说明 */}
                {env.description && (
                  <p className="text-[11px] text-slate-400 leading-relaxed truncate">
                    {env.description}
                  </p>
                )}
              </div>

              {/* 卡片底部操作与连通性 */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                {/* Ping 探测 */}
                <button
                  type="button"
                  onClick={(e) => handlePing(e, env)}
                  disabled={pinging}
                  className="flex items-center space-x-1 text-[11px] text-slate-500 hover:text-sky-600 transition-colors cursor-pointer"
                  title="测试此连接器的网络延迟"
                >
                  <Activity className={`w-3 h-3 ${pinging ? 'animate-spin text-sky-600' : 'text-slate-400'}`} />
                  <span>
                    {pinging
                      ? '探测中...'
                      : ping?.success
                      ? `${ping.responseTimeMs}ms`
                      : '探测延迟'}
                  </span>
                </button>

                {/* 切换按键 */}
                {isSelected ? (
                  <div className="flex items-center space-x-1 text-emerald-600 font-semibold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>已连接此环境</span>
                  </div>
                ) : (
                  <button
                    onClick={() => onSelect(env.id)}
                    className="flex items-center space-x-1 text-[11px] font-semibold text-slate-600 hover:text-sky-600 group-hover:translate-x-0.5 transition-all cursor-pointer"
                  >
                    <span>切换连接</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
