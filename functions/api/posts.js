import { getSession } from '../_lib/session.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const sort = url.searchParams.get('sort') || 'votes';

  const session = await getSession(context);
  const userId = session?.userId ?? null;

  let orderBy;
  switch (sort) {
    case 'newest': orderBy = 'p.created_at DESC'; break;
    case 'oldest': orderBy = 'p.created_at ASC'; break;
    default:       orderBy = 'vote_count DESC, p.created_at DESC';
  }

  const { results } = await env.DB.prepare(`
    SELECT
      p.id, p.title, p.content, p.tags, p.created_at, p.updated_at,
      COUNT(v.post_id) AS vote_count,
      MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS user_voted
    FROM posts p
    LEFT JOIN votes v ON v.post_id = p.id
    GROUP BY p.id
    ORDER BY ${orderBy}
  `).bind(userId).all();

  const posts = results.map(p => ({
    ...p,
    tags: JSON.parse(p.tags || '[]'),
    user_voted: Boolean(p.user_voted),
  }));

  return Response.json(posts, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
