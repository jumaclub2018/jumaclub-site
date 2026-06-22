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

    const response = await env.ASSETS.fetch(request);

    // Cache static assets at the edge for 24h so mobile users don't hit the Worker on every request
    const ext = url.pathname.split('.').pop().toLowerCase();
    if (['webp', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'css', 'js', 'ico', 'woff', 'woff2'].includes(ext)) {
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'public, max-age=86400');
      return new Response(response.body, { status: response.status, headers });
    }

    return response;
  },
};
