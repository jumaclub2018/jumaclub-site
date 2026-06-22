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

    // Requests via custom domain route cause env.ASSETS subrequest loops.
    // Proxy to workers.dev; that invocation sees workers.dev host and calls env.ASSETS directly.
    if (url.hostname !== 'jumaclub-site.egorzhukov1995.workers.dev') {
      return fetch('https://jumaclub-site.egorzhukov1995.workers.dev' + url.pathname + url.search);
    }

    return env.ASSETS.fetch(request);
  },
};
