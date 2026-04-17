/* IDEA·LOG — frontend */

const state = {
  posts: [],
  user: null,
  sort: 'votes',
  expanded: new Set(),
  loading: true,
};

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
  } else {
    el.innerHTML = `<button class="login-btn" onclick="showAuthModal()">SIGN IN</button>`;
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

// ── Posts ──

async function loadPosts() {
  state.loading = true;
  renderFeed();
  try {
    state.posts = await fetch(`/api/posts?sort=${state.sort}`).then(r => r.json());
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
    if (inner && post?.content && !inner.dataset.rendered) {
      inner.innerHTML = md(post.content);
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

// ── Render ──

function postHTML(post, index) {
  const num  = String(index + 1).padStart(3, '0');
  const tags = (post.tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join('');
  const delay = Math.min(index * 28, 400);

  return `
    <article
      class="post${state.expanded.has(post.id) ? ' expanded' : ''}"
      data-id="${esc(post.id)}"
      style="animation-delay:${delay}ms"
      onclick="toggleExpand('${esc(post.id)}')"
    >
      <div class="post-num">${num}</div>
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
        </div>
        <div class="post-content" style="max-height:${state.expanded.has(post.id) ? '9999px' : '0'}">
          <div class="post-content-inner"${state.expanded.has(post.id) ? ' data-rendered="1"' : ''}>${
            state.expanded.has(post.id) && post.content ? md(post.content) : ''
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

  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => setSort(btn.dataset.sort));
  });

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('error')) {
    toast(`AUTH ERROR: ${urlParams.get('error').toUpperCase()}`);
    history.replaceState({}, '', '/');
  }

  await Promise.all([loadUser(), loadPosts()]);
  renderAuth();
});
