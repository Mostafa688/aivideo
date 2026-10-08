import fetch from 'node-fetch';

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// بحث حقيقي على الإنترنت — بيتستخدم لما العميل يطلب فيديو عن حدث حقيقي/تاريخي، عشان
// الايجنت يتأكد من المعلومات قبل ما يكتب السكريبت ويقدر يدّي العميل المصادر اللي استخدمها
export async function searchWeb(query, { maxResults = 5, includeDomains = null, depth = 'advanced' } = {}) {
  if (!TAVILY_API_KEY) throw new Error('TAVILY_API_KEY not set');
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      search_depth: depth,
      max_results: maxResults,
      include_answer: true,
      ...(includeDomains?.length ? { include_domains: includeDomains } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Tavily error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    answer: data.answer || '',
    results: (data.results || []).map(r => ({
      title: r.title,
      url: r.url,
      content: (r.content || '').slice(0, 600),
    })),
  };
}

export const WEB_SEARCH_AVAILABLE = !!TAVILY_API_KEY;
