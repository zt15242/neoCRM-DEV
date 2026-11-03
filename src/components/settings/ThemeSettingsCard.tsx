import React, { useState, useEffect } from 'react';
import { 
  Palette, 
  Sparkles, 
  Layers, 
  SunMedium, 
  Check 
} from 'lucide-react';
import { 
  ThemePalette, 
  GlassMode, 
  GlassPreset, 
  ThemeConfig, 
  getStoredThemeConfig, 
  saveThemeConfig, 
  subscribeThemeConfig 
} from '../../utils/themeManager';

interface ThemeCube {
  id: ThemePalette;
  title: string;
  subtitle: string;
  accent: string;
  isDark: boolean;
}

const THEME_OPTIONS: ThemeCube[] = [
  {
    id: 'codex-light',
    title: 'Codex 亮色',
    subtitle: '极简纸白 纯净阅读',
    accent: '#0169cc',
    isDark: false,
  },
  {
    id: 'codex-dark',
    title: 'Codex 暗色',
    subtitle: '沉浸炭黑 极客质感',
    accent: '#339cff',
    isDark: true,
  },
  {
    id: 'catppuccin-mocha',
    title: 'Mocha (摩卡)',
    subtitle: '摩卡暗色 舒适护眼',
    accent: '#cba6f7',
    isDark: true,
  },
  {
    id: 'catppuccin-latte',
    title: 'Latte (拿铁)',
    subtitle: '拿铁暖白 温润明快',
    accent: '#8839ef',
    isDark: false,
  },
];

interface ThemeSettingsCardProps {
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const ThemeSettingsCard: React.FC<ThemeSettingsCardProps> = ({ showToast }) => {
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>(getStoredThemeConfig);

  useEffect(() => {
    return subscribeThemeConfig((cfg) => setThemeConfig(cfg));
  }, []);

  const handleSelectPalette = (palette: ThemePalette) => {
    saveThemeConfig({ palette });
    showToast('success', `已切换至「${THEME_OPTIONS.find((t) => t.id === palette)?.title}」配色`);
  };

  const handleToggleGlass = (enabled: boolean) => {
    saveThemeConfig({ glassEnabled: enabled });
    showToast('info', enabled ? '已开启原生物理毛玻璃质感' : '已关闭毛玻璃质感');
  };

  const handleSelectGlassMode = (mode: GlassMode) => {
    saveThemeConfig({ glassMode: mode, glassEnabled: true });
  };

  const handleSelectGlassPreset = (preset: GlassPreset) => {
    saveThemeConfig({ glassPreset: preset, glassEnabled: true });
  };

  const handleToggleGroundGlow = (glow: boolean) => {
    saveThemeConfig({ groundGlow: glow });
    showToast('info', glow ? '已开启地面漫反射柔光斑' : '已关闭地面漫反射柔光斑');
  };

  return (
    <div className="space-y-6 text-xs select-none">
      {/* 头部标题 */}
      <div className="pb-3 border-b border-slate-200/80 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
            <Palette className="w-4 h-4 text-sky-600" />
            <span>界面外观与换肤 (Appearance & Glass)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            定制 NeoCRM 视觉风格，支持 Codex 经典黑白、Catppuccin 色盘与原生物理毛玻璃云母质感。
          </p>
        </div>
      </div>

      {/* 1. 主题配色选色方块网格 */}
      <div className="p-4 rounded-2xl border border-slate-200/90 bg-white space-y-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm">
            <Sparkles className="w-4 h-4 text-sky-600" />
            <span>主题配色 (Theme Palette)</span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            选择内置官方或 Codex 风格配色方案
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {THEME_OPTIONS.map((item) => {
            const isSelected = themeConfig.palette === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectPalette(item.id)}
                style={
                  isSelected
                    ? {
                        borderColor: item.accent,
                        backgroundColor: `color-mix(in srgb, ${item.accent} 14%, var(--theme-bg-layer-2, #181a20))`,
                        boxShadow: `0 0 0 1px ${item.accent}, 0 2px 10px color-mix(in srgb, ${item.accent} 25%, transparent)`,
                      }
                    : undefined
                }
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? 'font-bold'
                    : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <span
                      className="w-3.5 h-3.5 rounded-md shrink-0"
                      style={{
                        backgroundColor: item.accent,
                        boxShadow: `0 0 6px color-mix(in srgb, ${item.accent} 50%, transparent)`,
                      }}
                    />
                    <span className="font-bold text-slate-800 text-xs truncate">{item.title}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                </div>
                <div className="text-[10px] text-slate-400 leading-tight">
                  {item.subtitle}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 原生物理毛玻璃质感与云母悬浮 */}
      <div className="p-4 rounded-2xl border border-slate-200/90 bg-white space-y-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>物理级毛玻璃换肤 (Glassmorphism)</span>
            </div>
            <p className="text-slate-500 text-[11px] mt-0.5">
              启用窗口半透磨砂与云母悬浮效果，使面板与侧边栏具有层次感。
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleToggleGlass(!themeConfig.glassEnabled)}
            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
              themeConfig.glassEnabled ? 'bg-sky-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`block w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform mt-1 ${
                themeConfig.glassEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {themeConfig.glassEnabled && (
          <div className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in duration-150">
            {/* 排版模式 */}
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-700">排版模式</span>
                <p className="text-[10px] text-slate-400">云母效果重塑为悬浮磨砂卡片；平铺模式保持官方平铺布局</p>
              </div>
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => handleSelectGlassMode('standard')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                    themeConfig.glassMode === 'standard'
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  原版平铺
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectGlassMode('mica')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                    themeConfig.glassMode === 'mica'
                      ? 'bg-white text-indigo-600 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  云母悬浮
                </button>
              </div>
            </div>

            {/* 材质预设 */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-50">
              <div>
                <span className="font-semibold text-slate-700">材质预设</span>
                <p className="text-[10px] text-slate-400">在云母与平铺模式下均可自由切换通透与磨砂程度</p>
              </div>
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                {(['clear', 'standard', 'frosted'] as GlassPreset[]).map((p) => {
                  const labels: Record<GlassPreset, string> = {
                    clear: '清透 (高透光)',
                    standard: '标准 (适中)',
                    frosted: '磨砂 (强虚化)',
                  };
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleSelectGlassPreset(p)}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${
                        themeConfig.glassPreset === p
                          ? 'bg-white text-slate-900 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {labels[p]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. 地面漫反射光斑开关 */}
      <div className="p-4 rounded-2xl border border-slate-200/90 bg-white flex items-center justify-between shadow-2xs">
        <div>
          <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm">
            <SunMedium className="w-4 h-4 text-amber-500" />
            <span>地面漫反射光斑 (Ambient Ground Glow)</span>
          </div>
          <p className="text-slate-500 text-[11px] mt-0.5">
            在渐变地面上叠加柔光反射斑。开启后主页与背景会有自然的漫反射环境光晕。
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleToggleGroundGlow(!themeConfig.groundGlow)}
          className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
            themeConfig.groundGlow ? 'bg-sky-600' : 'bg-slate-300'
          }`}
        >
          <span
            className={`block w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform mt-1 ${
              themeConfig.groundGlow ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
};
