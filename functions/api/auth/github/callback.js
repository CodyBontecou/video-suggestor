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
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${baseUrl}/api/auth/github/callback`,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return Response.redirect('/?error=token_failed', 302);

    const [userRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'idea-log/1.0' },
      }),
      fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'idea-log/1.0' },
      }),
    ]);

    const ghUser = await userRes.json();
    const emails = await emailsRes.json().catch(() => []);
    const primaryEmail = Array.isArray(emails) ? (emails.find(e => e.primary)?.email ?? null) : null;
    const providerId = String(ghUser.id);

    await env.DB.prepare(`
      INSERT INTO users (id, provider, provider_id, username, name, avatar_url, email, created_at)
      VALUES (?, 'github', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_id) DO UPDATE SET
        username = excluded.username,
        name = excluded.name,
        avatar_url = excluded.avatar_url,
        email = COALESCE(excluded.email, users.email)
    `).bind(crypto.randomUUID(), providerId, ghUser.login, ghUser.name || ghUser.login, ghUser.avatar_url, primaryEmail, Date.now()).run();

    const user = await env.DB.prepare(
      'SELECT * FROM users WHERE provider = ? AND provider_id = ?'
    ).bind('github', providerId).first();

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
    console.error('GitHub OAuth error:', err);
    return Response.redirect('/?error=auth_failed', 302);
  }
}
