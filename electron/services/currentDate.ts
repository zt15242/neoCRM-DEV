/** The host's wall clock and time zone supply relative-date context for each turn. */
export function currentDateContext(now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return `【当前日期】根据设备系统时钟，本地日期为 ${date}（时区 ${timeZone}）。解释“今天、今年、最新”等相对时间时以此为准；系统时钟可能不准确。用户明确指定的历史日期保持不变。搜索新闻或时效性信息时，根据需求选择 web_search 的 time_range，搜索词使用正确日期，并核实原始来源的发布日期和事件发生日期；不确定日期时明确说明，不要把旧新闻称为今日新闻。`;
}
