import { getSession } from '../../_lib/session.js';

export async function onRequestGet(context) {
  const session = await getSession(context);
  if (!session) return Response.json({ user: null });
  return Response.json(session);
}
