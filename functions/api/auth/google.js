export async function onRequestGet(context) {
  const { env, request } = context;
  const state = crypto.randomUUID();
  await env.SESSIONS.put(`state:${state}`, '1', { expirationTtl: 600 });

  const baseUrl = env.BASE_URL || `https://${request.headers.get('host')}`;
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${baseUrl}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
  });

  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
}
