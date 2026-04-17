import { getSession } from '../../../_lib/session.js';
import { isOwner } from '../../../_lib/owner.js';

export async function onRequestPost(context) {
  const { env, params } = context;
  const session = await getSession(context);

  if (!isOwner(session)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = params.id;
  const result = await env.DB.prepare(
    "UPDATE posts SET status = 'published', updated_at = ? WHERE id = ? AND status = 'draft'"
  ).bind(Date.now(), id).run();

  if (result.meta.changes === 0) {
    return Response.json({ error: 'Not found or already published' }, { status: 404 });
  }

  return Response.json({ id, status: 'published' });
}
