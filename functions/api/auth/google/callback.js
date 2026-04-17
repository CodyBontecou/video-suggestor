import { createSession, sessionCookie } from '../../../_lib/session.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) return Response.redirect('/?error=missing_params', 302);

  const validState = await env.SESSIONS.get(`state:${state}`);
  if (!validState) return Response.redirect('/?error=invalid_state', 302);
  await env.SESSIONS.delete(`state:${state}`);

  const baseUrl = env.BASE_URL || `https://${request.headers.get('host')}`;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${baseUrl}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return Response.redirect('/?error=token_failed', 302);

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const gUser = await userRes.json();
    const providerId = String(gUser.id);

    await env.DB.prepare(`
      INSERT INTO users (id, provider, provider_id, username, name, avatar_url, email, created_at)
      VALUES (?, 'google', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_id) DO UPDATE SET
        name = excluded.name,
        avatar_url = excluded.avatar_url,
        email = COALESCE(excluded.email, users.email)
    `).bind(
      crypto.randomUUID(), providerId,
      (gUser.email || 'user').split('@')[0],
      gUser.name, gUser.picture, gUser.email, Date.now()
    ).run();

    const user = await env.DB.prepare(
      'SELECT * FROM users WHERE provider = ? AND provider_id = ?'
    ).bind('google', providerId).first();

    const sessionId = await createSession(env, {
      userId: user.id,
      username: user.username,
      name: user.name,
      avatar_url: user.avatar_url,
      email: user.email,
    });

    return new Response(null, {
      status: 302,
      headers: { Location: '/', 'Set-Cookie': sessionCookie(sessionId) },
    });
  } catch (err) {
    console.error('Google OAuth error:', err);
    return Response.redirect('/?error=auth_failed', 302);
  }
}
