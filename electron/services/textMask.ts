/** Per-request reversible text masking. The mapping stays in memory only. */
function isCard(value: string): boolean {
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = digits.length - 1, alternate = false; i >= 0; i--, alternate = !alternate) {
    let n = Number(digits[i]); if (alternate) { n *= 2; if (n > 9) n -= 9; } sum += n;
  }
  return sum % 10 === 0;
}
export class TextMask {
  private values = new Map<string, string>();
  private placeholders = new Map<string, string>();
  private replace(value: string, kind: string): string {
    let placeholder = this.values.get(value);
    if (!placeholder) {
      placeholder = `⟦NEO_${kind}_${this.values.size + 1}⟧`;
      this.values.set(value, placeholder); this.placeholders.set(placeholder, value);
    }
    return placeholder;
  }
  mask(value: string): string {
    return value
      .replace(/\b(?:(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{30,})\b/g, v => this.replace(v, 'KEY'))
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, v => this.replace(v, 'EMAIL'))
      .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, v => this.replace(v, 'PHONE'))
      .replace(/(?<!\d)[1-9]\d{16}[\dXx](?!\w)/g, v => this.replace(v, 'ID'))
      .replace(/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g, v => isCard(v) ? this.replace(v, 'CARD') : v);
  }
  maskValue(value: any): any {
    if (typeof value === 'string') return this.mask(value);
    if (Array.isArray(value)) return value.map(item => this.maskValue(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.maskValue(item)]));
    return value;
  }
  restore(value: string): string {
    for (const [placeholder, original] of this.placeholders) value = value.split(placeholder).join(original);
    return value;
  }
}
