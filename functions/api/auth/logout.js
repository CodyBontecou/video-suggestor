import { getSessionId, clearSessionCookie } from '../../_lib/session.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  const sessionId = getSessionId(request);
  if (sessionId) {
    await env.SESSIONS.delete(`session:${sessionId}`);
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': clearSessionCookie(),
    },
  });
}
