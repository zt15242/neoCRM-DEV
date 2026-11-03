/**
 * Codex UI 主题、玻璃质感 (Mica) 与地面光斑 (Ambient Glow) 统一管理器
 * 遵循 DSH Codex UI 原生物理毛玻璃规范与 Fail-Closed 熔断标准
 */

export type ThemePalette = 'codex-dark' | 'codex-light' | 'catppuccin-mocha' | 'catppuccin-latte';
export type GlassMode = 'none' | 'mica' | 'standard';
export type GlassPreset = 'clear' | 'standard' | 'frosted';

export interface ThemeConfig {
  palette: ThemePalette;
  glassEnabled: boolean;
  glassMode: GlassMode;
  glassPreset: GlassPreset;
  groundGlow: boolean;
}

const THEME_STORAGE_KEY = 'neocrm.ui.theme_config.v1';

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  palette: 'codex-light',
  glassEnabled: true,
  glassMode: 'mica',
  glassPreset: 'standard',
  groundGlow: true,
};

type ThemeListener = (config: ThemeConfig) => void;
const listeners = new Set<ThemeListener>();

export function getStoredThemeConfig(): ThemeConfig {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_THEME_CONFIG;
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_CONFIG;
    return { ...DEFAULT_THEME_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_THEME_CONFIG;
  }
}

export function saveThemeConfig(patch: Partial<ThemeConfig>): ThemeConfig {
  const current = getStoredThemeConfig();
  const next: ThemeConfig = { ...current, ...patch };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {}
  applyThemeToDom(next);
  listeners.forEach((fn) => fn(next));
  return next;
}

export function subscribeThemeConfig(fn: ThemeListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function applyThemeToDom(config: ThemeConfig): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDark = config.palette.includes('dark') || config.palette.includes('mocha');

  // 1. 设置根节点与 body 上的主题属性与颜色方案
  root.setAttribute('data-theme', config.palette);
  document.body.setAttribute('data-theme', config.palette);
  root.style.colorScheme = isDark ? 'dark' : 'light';

  if (isDark) {
    root.setAttribute('data-dark-mode', 'true');
    document.body.setAttribute('data-dark-mode', 'true');
    document.body.classList.add('dark');
  } else {
    root.removeAttribute('data-dark-mode');
    document.body.removeAttribute('data-dark-mode');
    document.body.classList.remove('dark');
  }

  // 2. 物理级毛玻璃属性
  if (config.glassEnabled) {
    root.setAttribute('data-glass', 'true');
    root.setAttribute('data-glass-mode', config.glassMode);
    root.setAttribute('data-glass-preset', config.glassPreset);
  } else {
    root.removeAttribute('data-glass');
    root.removeAttribute('data-glass-mode');
    root.removeAttribute('data-glass-preset');
  }

  // 3. 地面漫反射光斑
  if (config.groundGlow) {
    root.setAttribute('data-ground-glow', 'true');
  } else {
    root.removeAttribute('data-ground-glow');
  }
}

// 初始化执行一次，确保启动时立即生效
if (typeof window !== 'undefined') {
  try {
    applyThemeToDom(getStoredThemeConfig());
  } catch {}
}
