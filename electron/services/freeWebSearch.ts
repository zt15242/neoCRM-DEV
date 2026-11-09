import axios from 'axios';
export type SearchSource = { title: string; url: string; snippet?: string };
const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&(?:amp|quot|lt|gt|#39);/g, m => ({'&amp;':'&','&quot;':'"','&lt;':'<','&gt;':'>','&#39;':"'"}[m] || m)).replace(/\s+/g, ' ').trim().slice(0, 300);
function destination(raw: string): string | undefined {
  try {
    const url = new URL(raw.replace(/&amp;/g, '&'), 'https://duckduckgo.com');
    let result = url.hostname.endsWith('duckduckgo.com') && url.searchParams.has('uddg') ? url.searchParams.get('uddg')! : url.href;
    if (url.hostname.endsWith('bing.com') && url.pathname.startsWith('/ck/')) {
      const encoded = url.searchParams.get('u');
      if (encoded?.startsWith('a1')) result = Buffer.from(encoded.slice(2), 'base64url').toString();
    }
    const parsed = new URL(result);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return undefined;
    return parsed.href;
  } catch { return undefined; }
}
export function parseSearchPage(html: string, engine: 'ddg' | 'bing'): SearchSource[] {
  const blocks = engine === 'ddg' ? html.match(/<div\b[^>]*class=["'][^"']*\bresult\b[^"']*["'][^>]*>[\s\S]*?(?=<div\b[^>]*class=["'][^"']*\bresult\b|$)/gi) || []
    : html.match(/<li\b[^>]*class=["'][^"']*\bb_algo\b[^"']*["'][^>]*>[\s\S]*?<\/li>/gi) || [];
  const result: SearchSource[] = [];
  for (const block of blocks) {
    const link = engine === 'ddg' ? block.match(/<a\b[^>]*class=["'][^"']*\bresult__a\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
      : block.match(/<h2\b[^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const url = destination(link[1]); const title = plain(link[2]);
    if (!url || !title) continue;
    const snippet = block.match(engine === 'ddg' ? /class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i : /<p\b[^>]*>([\s\S]*?)<\/p>/i);
    result.push({ title, url, ...(snippet ? { snippet: plain(snippet[1]) } : {}) });
  }
  return result.slice(0, 5);
}
export type SearchTimeRange = 'day' | 'week' | 'month' | 'year';
export async function freeWebSearch(queries: string[], fetchPage = async (url: string) => String((await axios.get(url, { timeout: 8000, maxContentLength: 1024 * 1024, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7' } })).data), timeRange?: SearchTimeRange): Promise<{ sources: SearchSource[]; totalResults: number; warnings?: string[] }> {
  if (timeRange && !['day', 'week', 'month', 'year'].includes(timeRange)) throw new Error('搜索时间范围仅支持 day、week、month 或 year');
  const sources: SearchSource[] = []; const warnings: string[] = []; const seen = new Set<string>();
  for (const query of queries.slice(0, 3)) {
    const q = String(query).trim().slice(0, 500); if (!q) continue;
    let found = false;
    for (const engine of ['ddg', 'bing'] as const) {
      try {
        const base = engine === 'ddg' ? 'https://html.duckduckgo.com/html/' : 'https://www.bing.com/search';
        const params = new URLSearchParams({ q });
        if (engine === 'ddg' && timeRange) params.set('df', {day:'d',week:'w',month:'m',year:'y'}[timeRange]);
        const parsed = parseSearchPage(await fetchPage(`${base}?${params}`), engine);
        if (!parsed.length) continue;
        for (const source of parsed) if (!seen.has(source.url)) { seen.add(source.url); sources.push(source); }
        if (engine === 'bing' && timeRange) warnings.push(`“${q}”的备用搜索不支持时间过滤，请逐条核实发布时间。`);
        else if (timeRange) warnings.push(`“${q}”已请求按时间范围筛选，仍需核实来源的发布日期。`);
        found = true; break;
      } catch { /* try the next provider */ }
    }
    if (!found) warnings.push(`“${q}”未取得可验证的搜索结果，搜索服务可能不可用或无结果。`);
  }
  return { sources, totalResults: sources.length, ...(warnings.length ? { warnings } : {}) };
}
