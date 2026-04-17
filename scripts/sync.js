#!/usr/bin/env node
// Sync Obsidian vault markdown files → Cloudflare D1

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VAULT  = process.env.VAULT_PATH || path.resolve(__dirname, '../../../dev/videos');
const DB     = process.env.DB_NAME    || 'video-suggestor-db';
const REMOTE = process.argv.includes('--remote') ? '--remote' : '--local';
const SKIP   = new Set(['Welcome.md']);

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw.trim() };

  const fm = {};
  for (const line of m[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (val.startsWith('[')) {
      fm[key] = val.slice(1, -1).split(',').map(v => v.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    } else {
      fm[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }
  return { fm, body: m[2].trim() };
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function esc(s) { return s.replace(/'/g, "''"); }

if (!fs.existsSync(VAULT)) {
  console.error(`Vault not found: ${VAULT}`);
  process.exit(1);
}

const files = fs.readdirSync(VAULT).filter(f => f.endsWith('.md') && !SKIP.has(f));

if (!files.length) {
  console.log('No markdown files to sync.');
  process.exit(0);
}

console.log(`Syncing ${files.length} file(s) from ${VAULT}...`);

const sqls = files.map(file => {
  const fullPath = path.join(VAULT, file);
  const raw = fs.readFileSync(fullPath, 'utf-8');
  const { fm, body } = parseFrontmatter(raw);

  let title = fm.title || '';
  if (!title) {
    const h1 = body.match(/^#\s+(.+)$/m);
    title = h1 ? h1[1] : file.replace(/\.md$/, '');
  }

  const id       = slugify(title);
  const tags     = JSON.stringify(fm.tags || []);
  const stat     = fs.statSync(fullPath);
  const created  = fm.date ? new Date(fm.date).getTime() : Math.floor(stat.birthtimeMs);
  const now      = Date.now();

  return `INSERT INTO posts (id, title, content, tags, created_at, updated_at)
VALUES ('${esc(id)}','${esc(title)}','${esc(body)}','${esc(tags)}',${created},${now})
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title, content=excluded.content,
  tags=excluded.tags, updated_at=excluded.updated_at;`;
});

const tmp = `/tmp/vidlog-sync-${Date.now()}.sql`;
fs.writeFileSync(tmp, sqls.join('\n\n'));

try {
  execSync(`npx wrangler d1 execute "${DB}" ${REMOTE} --file="${tmp}"`, {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
  });
  console.log(`Done. ${files.length} post(s) upserted.`);
} finally {
  fs.unlinkSync(tmp);
}
