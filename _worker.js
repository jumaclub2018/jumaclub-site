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

    return env.ASSETS.fetch(request);
  },
};
