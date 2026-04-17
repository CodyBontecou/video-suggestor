const COOKIE_NAME = 'session';
const SESSION_TTL = 60 * 60 * 24 * 30;

export function getSessionId(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export async function getSession(context) {
  const sessionId = getSessionId(context.request);
  if (!sessionId) return null;
  const data = await context.env.SESSIONS.get(`session:${sessionId}`);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function createSession(env, userData) {
  const sessionId = crypto.randomUUID();
  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(userData), {
    expirationTtl: SESSION_TTL,
  });
  return sessionId;
}

export function sessionCookie(sessionId) {
  return `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
