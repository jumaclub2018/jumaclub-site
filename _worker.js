const RAILWAY = 'https://jumaclub-site-production.up.railway.app';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API and images — proxy to Railway (bypasses corrupted Workers CDN cache)
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/img/') || url.pathname.startsWith('/images/')) {
      // Railway still has old /images/webp/ path; map /img/ → /images/webp/
      const railwayPath = url.pathname.startsWith('/img/')
        ? url.pathname.replace('/img/', '/images/webp/')
        : url.pathname;
      const upstream = await fetch(RAILWAY + railwayPath + url.search, {
        method: request.method,
        headers: {
          'Host': 'jumaclub-site-production.up.railway.app',
          ...(request.method !== 'GET' && request.method !== 'HEAD'
            ? { 'Content-Type': request.headers.get('Content-Type') || '' }
            : {}),
        },
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      });

      const headers = new Headers(upstream.headers);
      // Long cache for images so CDN stores them correctly after first fetch
      const ext = url.pathname.split('.').pop().toLowerCase();
      if (['webp', 'jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
        headers.set('Cache-Control', 'public, max-age=86400');
      }
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    // HTML, CSS, JS — from Workers Static Assets
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'public, max-age=300');
    return new Response(response.body, { status: response.status, headers });
  },
};
