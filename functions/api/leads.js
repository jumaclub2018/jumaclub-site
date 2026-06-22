export async function onRequestPost(context) {
  const res = await fetch('https://jumaclub-site-production.up.railway.app/api/leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': 'jumaclub-site-production.up.railway.app',
    },
    body: context.request.body,
  });
  return res;
}
