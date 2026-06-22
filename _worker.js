export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return fetch('https://jumaclub-site-production.up.railway.app' + url.pathname + url.search, {
        method: request.method,
        headers: {
          'Content-Type': request.headers.get('Content-Type') || '',
          'Host': 'jumaclub-site-production.up.railway.app',
        },
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      });
    }

    // Rewrite to canonical workers.dev URL with clean headers so ASSETS binding resolves correctly
    const canonicalUrl = new URL(url.pathname + url.search, 'https://jumaclub-site.egorzhukov1995.workers.dev');
    return env.ASSETS.fetch(new Request(canonicalUrl.toString(), {
      method: request.method,
      headers: { 'Accept': request.headers.get('Accept') || '*/*' },
    }));
  },
};
