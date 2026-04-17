import { getSession } from '../_lib/session.js';
import { isOwner } from '../_lib/owner.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const sort = url.searchParams.get('sort') || 'votes';

  const session = await getSession(context);
  const userId = session?.userId ?? null;
  const owner = isOwner(session);

  let orderBy;
  switch (sort) {
    case 'newest': orderBy = 'p.created_at DESC'; break;
    case 'oldest': orderBy = 'p.created_at ASC'; break;
    default:       orderBy = 'vote_count DESC, p.created_at DESC';
  }

  const statusFilter = owner ? '' : "WHERE p.status = 'published'";

  const { results } = await env.DB.prepare(`
    SELECT
      p.id, p.title, p.content, p.tags, p.status, p.created_at, p.updated_at,
      COUNT(v.post_id) AS vote_count,
      MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS user_voted,
      u.username AS author_username,
      u.name AS author_name
    FROM posts p
    LEFT JOIN votes v ON v.post_id = p.id
    LEFT JOIN users u ON u.id = p.user_id
    ${statusFilter}
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

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await getSession(context);

  if (!session?.userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const title = (body.title || '').trim();
  if (!title) {
    return Response.json({ error: 'Title is required' }, { status: 400 });
  }
  if (title.length > 200) {
    return Response.json({ error: 'Title too long' }, { status: 400 });
  }

  const content = (body.content || '').trim();
  const tags = Array.isArray(body.tags) ? body.tags.map(t => String(t).trim()).filter(Boolean) : [];
  const status = isOwner(session) ? 'published' : 'draft';

  const id = crypto.randomUUID();
  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO posts (id, title, content, tags, user_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, title, content, JSON.stringify(tags), session.userId, status, now, now).run();

  return Response.json({
    id,
    title,
    content,
    tags,
    status,
    user_id: session.userId,
    author_username: session.username || null,
    author_name: session.name || null,
    created_at: now,
    updated_at: now,
    vote_count: 0,
    user_voted: false,
  }, { status: 201 });
}
