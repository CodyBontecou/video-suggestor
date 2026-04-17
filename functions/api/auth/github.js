export async function onRequestGet(context) {
  const { env, request } = context;
  const state = crypto.randomUUID();
  await env.SESSIONS.put(`state:${state}`, '1', { expirationTtl: 600 });

  const baseUrl = env.BASE_URL || `https://${request.headers.get('host')}`;
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    scope: 'read:user user:email',
    state,
    redirect_uri: `${baseUrl}/api/auth/github/callback`,
  });

  return Response.redirect(`https://github.com/login/oauth/authorize?${params}`, 302);
}
