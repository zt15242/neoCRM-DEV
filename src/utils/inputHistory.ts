/**
 * 终端风格输入历史记录与 ↑ / ↓ 快速召回器
 * 灵感来源于 DSH Codex UI / Terminal CLI 体验：
 * - 只有在输入框为空或光标位于行首时按 ↑ 触发历史召回
 * - 按 ↓ 向后翻阅历史，触底时自动恢复用户原本正在编辑的草稿
 * - 用户手动编辑时立即退出历史浏览状态，绝不覆盖新草稿
 */

const STORAGE_KEY = 'neocrm.ai.input_history.v1';
const MAX_HISTORY_ITEMS = 100;

export class InputHistory {
  private entries: string[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.entries = parsed
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .slice(-MAX_HISTORY_ITEMS);
      }
    } catch (e) {
      console.warn('读取输入历史失败:', e);
      this.entries = [];
    }
  }

  public getEntries(): readonly string[] {
    return this.entries;
  }

  public add(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    // 避免连续重复记录
    if (this.entries.length > 0 && this.entries[this.entries.length - 1] === trimmed) {
      return;
    }
    // 如果之前已有相同内容，先移除旧项再加到最末端
    const existingIdx = this.entries.indexOf(trimmed);
    if (existingIdx !== -1) {
      this.entries.splice(existingIdx, 1);
    }
    this.entries.push(trimmed);
    if (this.entries.length > MAX_HISTORY_ITEMS) {
      this.entries = this.entries.slice(-MAX_HISTORY_ITEMS);
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
      }
    } catch {}
  }

  public clear(): void {
    this.entries = [];
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  }
}

export class HistoryCursor {
  private index: number | undefined = undefined;
  private originalDraft = '';
  private displayedHistory = '';

  public reset(): void {
    this.index = undefined;
    this.originalDraft = '';
    this.displayedHistory = '';
  }

  /**
   * 移动历史指针
   * @param direction -1 (向上 recall 前序历史), 1 (向下翻回最新)
   * @param currentText 当前输入框文本
   * @param historyEntries 历史列表（按时间从旧到新排列）
   */
  public move(direction: -1 | 1, currentText: string, historyEntries: readonly string[]): string | undefined {
    if (historyEntries.length === 0) return undefined;

    // 如果用户在历史记录上修改了内容，则重置指针
    if (this.index !== undefined && currentText !== this.displayedHistory) {
      this.reset();
    }

    // 初次触发历史召回
    if (this.index === undefined) {
      if (direction !== -1) return undefined;
      this.originalDraft = currentText;
      this.index = historyEntries.length; // 指向末尾之后
    }

    const nextIndex = this.index + direction;

    // 超出左边界
    if (nextIndex < 0) {
      this.index = 0;
      this.displayedHistory = historyEntries[0] || '';
      return this.displayedHistory;
    }

    // 触底恢复原始草稿
    if (nextIndex >= historyEntries.length) {
      const restored = this.originalDraft;
      this.reset();
      return restored;
    }

    this.index = nextIndex;
    this.displayedHistory = historyEntries[this.index] || '';
    return this.displayedHistory;
  }
}

export const globalInputHistory = new InputHistory();
