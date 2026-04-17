import { getSession } from '../../../_lib/session.js';
import { isOwner } from '../../../_lib/owner.js';

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const session = await getSession(context);

  if (!isOwner(session)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body = {};
  try { body = await request.json(); } catch {}
  const made = body.made === true ? 1 : body.made === false ? 0 : null;

  const id = params.id;
  const now = Date.now();

  const result = made === null
    ? await env.DB.prepare(
        'UPDATE posts SET made = 1 - made, updated_at = ? WHERE id = ?'
      ).bind(now, id).run()
    : await env.DB.prepare(
        'UPDATE posts SET made = ?, updated_at = ? WHERE id = ?'
      ).bind(made, now, id).run();

  if (result.meta.changes === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const { results } = await env.DB.prepare(
    'SELECT made FROM posts WHERE id = ?'
  ).bind(id).all();

  return Response.json({ id, made: Boolean(results[0]?.made) });
}
