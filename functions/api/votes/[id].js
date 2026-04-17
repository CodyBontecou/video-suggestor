import { getSession } from '../../_lib/session.js';

export async function onRequestPost(context) {
  const { params, env } = context;
  const { id } = params;

  const session = await getSession(context);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.userId;

  const existing = await env.DB.prepare(
    'SELECT 1 FROM votes WHERE post_id = ? AND user_id = ?'
  ).bind(id, userId).first();

  let voted;
  if (existing) {
    await env.DB.prepare(
      'DELETE FROM votes WHERE post_id = ? AND user_id = ?'
    ).bind(id, userId).run();
    voted = false;
  } else {
    await env.DB.prepare(
      'INSERT INTO votes (post_id, user_id, created_at) VALUES (?, ?, ?)'
    ).bind(id, userId, Date.now()).run();
    voted = true;
  }

  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM votes WHERE post_id = ?'
  ).bind(id).first();

  return Response.json({ voted, count: Number(row.count) });
}
