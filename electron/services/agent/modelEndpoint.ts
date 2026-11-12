import type { AiProviderConfig } from '../../../shared/types';

export type ModelTransport = 'chat' | 'responses' | 'anthropic' | 'gemini';

/** Keep complete endpoints, custom gateway prefixes and query parameters intact. */
export function resolveModelEndpoints(provider: AiProviderConfig, modelId: string, stream = false) {
  let url: URL;
  try { url = new URL(provider.baseUrl.trim()); }
  catch { throw new Error('模型供应商的 Base URL 无效，请检查模型设置'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('模型供应商的 Base URL 必须是 HTTP(S) 地址，认证信息请填写在 API Key 中');
  }
  url.hash = '';
  const pathname = url.pathname.replace(/\/+$/, '');
  const nativeGemini = provider.protocol === 'google-gemini' && !/\/openai(?:\/chat\/completions)?$/.test(pathname);
  const transport: ModelTransport = nativeGemini ? 'gemini'
    : provider.protocol === 'anthropic-messages' ? 'anthropic'
    : provider.protocol === 'openai-responses' ? 'responses' : 'chat';
  const operation = nativeGemini
    ? `/models/${modelId.replace(/^models\//, '').split('/').map(encodeURIComponent).join('/')}:${stream ? 'streamGenerateContent' : 'generateContent'}`
    : transport === 'anthropic' ? '/messages' : transport === 'responses' ? '/responses' : '/chat/completions';
  const prefix = pathname.replace(/\/(?:chat\/completions|responses|messages|models\/.+:(?:streamGenerateContent|generateContent))$/, '');
  const explicit = prefix !== pathname;
  const roots = explicit || prefix ? [prefix] : [nativeGemini ? '/v1beta' : '/v1'];
  // Only a route 404 can use this alternate convention; never change host or protocol.
  if (!explicit && !nativeGemini && !/\/v\d[^/]*(?:\/|$)/.test(prefix)) roots.push(prefix ? `${prefix}/v1` : '');
  return {
    transport, nativeGemini,
    endpoints: [...new Set(roots)].map(root => {
      const endpoint = new URL(url);
      endpoint.pathname = root + operation;
      if (nativeGemini) {
        // The transport selects framing; stale parameters from a copied URL cannot override it.
        if (stream) endpoint.searchParams.set('alt', 'sse');
        else if (endpoint.searchParams.get('alt') === 'sse') endpoint.searchParams.delete('alt');
      }
      return endpoint.toString();
    }),
  };
}
