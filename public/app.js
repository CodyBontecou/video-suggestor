/* IDEA·LOG — frontend */

const OWNER_EMAILS = ['bontecouc@gmail.com', 'codybontecou@gmail.com', 'cody@isolated.tech'];

const state = {
  posts: [],
  user: null,
  sort: 'votes',
  filter: 'all',
  expanded: new Set(),
  loading: true,
};

function isOwner() {
  return state.user?.email && OWNER_EMAILS.includes(state.user.email);
}

// ── Utilities ──

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}·${String(d.getMonth() + 1).padStart(2, '0')}·${String(d.getDate()).padStart(2, '0')}`;
}

function md(content) {
  if (typeof marked !== 'undefined' && content) {
    return marked.parse(content, { gfm: true, breaks: true });
  }
  return `<pre style="white-space:pre-wrap">${esc(content)}</pre>`;
}

function youtubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null;
    if (/(^|\.)youtube\.com$/.test(u.hostname)) {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(embed|shorts|v)\/([^/?#]+)/);
      if (m) return m[2];
    }
  } catch {}
  return null;
}

function expandedHTML(post) {
  const video = post.made && post.video_url ? videoEmbedHTML(post.video_url) : '';
  const body = post.content ? md(post.content) : '';
  return `${video}${body}`;
}

function videoEmbedHTML(url) {
  if (!url) return '';
  const yt = youtubeId(url);
  if (yt) {
    return `<div class="video-embed"><iframe
      src="https://www.youtube.com/embed/${esc(yt)}"
      title="Video"
      loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe></div>`;
  }
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)) {
    return `<div class="video-embed"><video controls preload="metadata" src="${esc(url)}"></video></div>`;
  }
  return `<div class="video-link"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">▶ WATCH VIDEO</a></div>`;
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Theme ──

function initTheme() {
  const saved = localStorage.getItem('theme');
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved || system);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.querySelector('.theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? '◑' : '◐';
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#1a1a1a' : '#edeae3');
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('theme', next);
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  if (!localStorage.getItem('theme')) applyTheme(e.matches ? 'dark' : 'light');
});

// ── Auth ──

async function loadUser() {
  try {
    const data = await fetch('/api/auth/me').then(r => r.json());
    state.user = data.userId ? data : null;
  } catch {
    state.user = null;
  }
}

function renderAuth() {
  const el = document.getElementById('auth-area');
  const submitBtn = document.getElementById('submit-btn');
  if (!el) return;
  if (state.user) {
    el.innerHTML = `
      <div class="user-area">
        ${state.user.avatar_url
          ? `<img class="user-avatar" src="${esc(state.user.avatar_url)}" alt="${esc(state.user.username || '')}">`
          : ''}
        <span class="user-name">${esc(state.user.username || state.user.name || 'User')}</span>
        <button class="logout-btn" onclick="handleLogout()">SIGN OUT</button>
      </div>`;
    if (submitBtn) submitBtn.style.display = '';
  } else {
    el.innerHTML = `<button class="login-btn" onclick="showAuthModal()">SIGN IN</button>`;
    if (submitBtn) submitBtn.style.display = 'none';
  }
}

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  state.user = null;
  state.posts = state.posts.map(p => ({ ...p, user_voted: false }));
  renderAuth();
  renderFeed();
}

function showAuthModal() {
  document.getElementById('auth-modal').style.display = 'flex';
}

function closeAuthModal(e) {
  if (!e || e.target.id === 'auth-modal' || e.currentTarget.id === 'modal-close') {
    document.getElementById('auth-modal').style.display = 'none';
  }
}

function showCreateModal() {
  if (!state.user) { showAuthModal(); return; }
  document.getElementById('create-modal').style.display = 'flex';
  document.getElementById('create-title').focus();
}

function closeCreateModal() {
  document.getElementById('create-modal').style.display = 'none';
  document.getElementById('create-form').reset();
}

// ── Posts ──

async function loadPosts() {
  state.loading = true;
  renderFeed();
  try {
    const params = new URLSearchParams({ sort: state.sort });
    if (state.filter === 'made') params.set('made', 'true');
    if (state.filter === 'todo') params.set('made', 'false');
    state.posts = await fetch(`/api/posts?${params}`).then(r => r.json());
  } catch {
    state.posts = [];
    toast('ERR: COULD NOT FETCH POSTS');
  }
  state.loading = false;
  renderFeed();
  renderPostCount();
}

function setSort(sort) {
  if (sort === state.sort) return;
  state.sort = sort;
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === sort);
  });
  state.expanded.clear();
  loadPosts();
}

function setFilter(filter) {
  if (filter === state.filter) return;
  state.filter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  state.expanded.clear();
  loadPosts();
}

function renderPostCount() {
  const el = document.getElementById('post-count');
  if (el) el.textContent = `${String(state.posts.length).padStart(3, '0')} IDEAS`;
}

// ── Expand ──

function toggleExpand(id) {
  const article = document.querySelector(`[data-id="${id}"]`);
  if (!article) return;
  const content = article.querySelector('.post-content');

  if (state.expanded.has(id)) {
    state.expanded.delete(id);
    article.classList.remove('expanded');
    content.style.maxHeight = '0';
  } else {
    state.expanded.add(id);
    article.classList.add('expanded');

    const post = state.posts.find(p => p.id === id);
    const inner = content.querySelector('.post-content-inner');
    if (inner && post && !inner.dataset.rendered) {
      inner.innerHTML = expandedHTML(post);
      inner.dataset.rendered = '1';
    }

    content.style.maxHeight = content.scrollHeight + 'px';
    requestAnimationFrame(() => {
      content.style.maxHeight = content.scrollHeight + 'px';
    });
  }
}

// ── Vote ──

async function toggleVote(postId, event) {
  event.stopPropagation();
  if (!state.user) { showAuthModal(); return; }

  const article = document.querySelector(`[data-id="${postId}"]`);
  const btn = article?.querySelector('.vote-btn');
  if (btn) btn.disabled = true;

  try {
    const { voted, count } = await fetch(`/api/votes/${postId}`, { method: 'POST' }).then(r => r.json());

    const post = state.posts.find(p => p.id === postId);
    if (post) { post.vote_count = count; post.user_voted = voted; }

    if (btn) {
      btn.classList.toggle('voted', voted);
      btn.disabled = false;
    }

    const countEl = article?.querySelector('.vote-count');
    if (countEl) {
      countEl.textContent = count;
      countEl.classList.add('tick');
      setTimeout(() => countEl.classList.remove('tick'), 300);
    }
  } catch {
    if (btn) btn.disabled = false;
    toast('ERR: VOTE FAILED');
  }
}

// ── Made toggle ──

async function toggleMade(postId, event) {
  event.stopPropagation();
  const post = state.posts.find(p => p.id === postId);
  if (!post) return;
  const target = !post.made;

  try {
    const res = await fetch(`/api/posts/${postId}/made`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ made: target }),
    });
    if (!res.ok) throw new Error('Failed');
    const { made } = await res.json();
    post.made = made;

    if ((state.filter === 'made' && !made) || (state.filter === 'todo' && made)) {
      state.posts = state.posts.filter(p => p.id !== postId);
      renderPostCount();
    }
    renderFeed();
    toast(made ? 'MARKED MADE' : 'MARKED TODO');
  } catch {
    toast('ERR: UPDATE FAILED');
  }
}

// ── Approve ──

async function approvePost(postId) {
  try {
    const res = await fetch(`/api/posts/${postId}/approve`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed');
    const post = state.posts.find(p => p.id === postId);
    if (post) post.status = 'published';
    renderFeed();
    toast('IDEA APPROVED');
  } catch {
    toast('ERR: APPROVE FAILED');
  }
}

// ── Render ──

function postHTML(post, index) {
  const tags = (post.tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join('');
  const delay = Math.min(index * 28, 400);

  return `
    <article
      class="post${state.expanded.has(post.id) ? ' expanded' : ''}${post.made ? ' made' : ''}"
      data-id="${esc(post.id)}"
      style="animation-delay:${delay}ms"
      onclick="toggleExpand('${esc(post.id)}')"
    >
      <div class="post-vote">
        <button
          class="vote-btn${post.user_voted ? ' voted' : ''}"
          onclick="toggleVote('${esc(post.id)}', event)"
          title="${post.user_voted ? 'Remove vote' : 'Upvote'}"
          aria-label="${post.user_voted ? 'Remove vote' : 'Upvote'}"
          aria-pressed="${post.user_voted}"
        ><span>▲</span></button>
        <span class="vote-count">${post.vote_count || 0}</span>
      </div>
      <div class="post-body">
        <h2 class="post-title">${esc(post.title)}</h2>
        ${tags ? `<div class="post-tags">${tags}</div>` : ''}
        <div class="post-meta">
          <span class="post-date">${fmtDate(post.created_at)}</span>
          ${post.author_username || post.author_name
            ? `<span class="post-author">∙ ${esc(post.author_username || post.author_name)}</span>`
            : ''}
          ${post.status === 'draft' ? `<span class="post-draft">PENDING</span>` : ''}
          ${isOwner()
            ? `<button
                 class="made-toggle${post.made ? ' is-made' : ''}"
                 onclick="toggleMade('${esc(post.id)}', event)"
                 title="${post.made ? 'Mark as not made' : 'Mark as made'}"
                 aria-pressed="${post.made}"
               >${post.made ? '✓ MADE' : '○ TODO'}</button>`
            : post.made
              ? `<span class="post-made">✓ MADE</span>`
              : ''}
        </div>
        ${post.status === 'draft' && isOwner()
          ? `<div class="post-approve-bar" onclick="event.stopPropagation()">
               <button class="approve-btn" onclick="approvePost('${esc(post.id)}')">APPROVE</button>
             </div>`
          : ''}
        <div class="post-content" style="max-height:${state.expanded.has(post.id) ? '9999px' : '0'}">
          <div class="post-content-inner"${state.expanded.has(post.id) ? ' data-rendered="1"' : ''}>${
            state.expanded.has(post.id) ? expandedHTML(post) : ''
          }</div>
        </div>
      </div>
    </article>`;
}

function renderFeed() {
  const feed = document.getElementById('feed');
  if (!feed) return;

  if (state.loading) {
    feed.innerHTML = `<div class="state-msg"><span class="loading-text">LOADING</span><span class="loading-dots" aria-hidden="true">···</span></div>`;
    return;
  }

  if (!state.posts.length) {
    feed.innerHTML = `<div class="state-msg">NO IDEAS FOUND</div>`;
    return;
  }

  feed.innerHTML = state.posts.map((p, i) => postHTML(p, i)).join('');
}

// ── Init ──

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();

  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('modal-close')?.addEventListener('click', () => closeAuthModal({ currentTarget: { id: 'modal-close' } }));
  document.getElementById('auth-modal')?.addEventListener('click', closeAuthModal);

  document.getElementById('create-modal-close')?.addEventListener('click', closeCreateModal);
  document.getElementById('create-modal')?.addEventListener('click', e => {
    if (e.target.id === 'create-modal') closeCreateModal();
  });

  document.getElementById('create-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitBtn = document.getElementById('create-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'SUBMITTING…';

    try {
      const title = document.getElementById('create-title').value.trim();
      const content = document.getElementById('create-content').value.trim();
      const tagsRaw = document.getElementById('create-tags').value;
      const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, tags }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit');
      }

      closeCreateModal();
      await loadPosts();
      toast('IDEA SUBMITTED');
    } catch (err) {
      toast(`ERR: ${err.message.toUpperCase()}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'SUBMIT';
    }
  });

  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => setSort(btn.dataset.sort));
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter));
  });

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('error')) {
    toast(`AUTH ERROR: ${urlParams.get('error').toUpperCase()}`);
    history.replaceState({}, '', '/');
  }

  await Promise.all([loadUser(), loadPosts()]);
  renderAuth();
});
