import { Router } from 'express';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export const gitRouter = Router();
export const gitUIRouter = Router();

const ARCHEION_DIR = '/srv/archeion';
const ALLOWED_REPOS = ['bibliotheke', 'metroon'];

function getRepoPath(repo: string): string {
  return path.join(ARCHEION_DIR, `${repo}.git`);
}

function git(repo: string, cmd: string): string {
  const repoPath = getRepoPath(repo);
  try {
    return execSync(`git --git-dir=${repoPath} ${cmd}`, { encoding: 'utf-8' }).trim();
  } catch { return ''; }
}

// API: GET /api/git/repos — リポジトリ一覧
gitRouter.get('/repos', (_req, res) => {
  const repos = ALLOWED_REPOS.filter(r => fs.existsSync(getRepoPath(r))).map(r => {
    const lastCommit = git(r, 'log -1 --format=%H|%s|%an|%ar');
    const [hash, subject, author, reltime] = lastCommit.split('|');
    const branches = git(r, 'branch').split('\n').map(b => b.trim().replace(/^\*\s*/, '')).filter(Boolean);
    return { name: r, branches, lastCommit: { hash: hash?.slice(0,7), subject, author, reltime } };
  });
  res.json(repos);
});

// API: GET /api/git/:repo/log?branch=main&limit=20
gitRouter.get('/:repo/log', (req, res) => {
  const repo = req.params.repo;
  if (!ALLOWED_REPOS.includes(repo)) return res.status(404).json({ error: 'not found' });
  const branch = String(req.query.branch || 'main').replace(/[^a-zA-Z0-9_\-/.]/g, '');
  const limit = Math.min(parseInt(String(req.query.limit || '30')), 100);
  const raw = git(repo, `log ${branch} --format=%H|%s|%an|%ae|%ar|%ai -n ${limit}`);
  const commits = raw.split('\n').filter(Boolean).map(line => {
    const [hash, subject, author, email, reltime, datetime] = line.split('|');
    return { hash, short: hash?.slice(0,7), subject, author, email, reltime, datetime };
  });
  res.json({ repo, branch, commits });
});

// API: GET /api/git/:repo/branches
gitRouter.get('/:repo/branches', (req, res) => {
  const repo = req.params.repo;
  if (!ALLOWED_REPOS.includes(repo)) return res.status(404).json({ error: 'not found' });
  const raw = git(repo, 'branch -a --format=%(refname:short)|%(objectname:short)|%(subject)|%(authorname)|%(authorrelativedate)');
  const branches = raw.split('\n').filter(Boolean).map(line => {
    const [name, hash, subject, author, reltime] = line.split('|');
    return { name, hash, subject, author, reltime };
  });
  res.json({ repo, branches });
});

// UI: GET /tools/git/
gitUIRouter.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>agora — git viewer</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d1117; color: #c9d1d9; font-family: 'Inter', sans-serif; min-height: 100vh; }
    header { padding: 20px 32px; border-bottom: 1px solid #21262d; display: flex; align-items: center; gap: 12px; }
    header a { color: #8b949e; text-decoration: none; font-size: .85rem; }
    header a:hover { color: #c9d1d9; }
    .title { font-family: 'Cormorant Garamond', serif; font-size: 1.4rem; color: #e6edf3; letter-spacing: .08em; }
    .title span { color: #8b949e; font-size: .9em; }
    .container { max-width: 1100px; margin: 0 auto; padding: 32px; }
    .repos { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
    @media(max-width:700px) { .repos { grid-template-columns: 1fr; } }
    .repo-card { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 20px; cursor: pointer; transition: border-color .2s; }
    .repo-card:hover, .repo-card.active { border-color: #388bfd; }
    .repo-name { font-family: 'JetBrains Mono', monospace; font-size: 1rem; color: #58a6ff; margin-bottom: 6px; }
    .repo-desc { font-size: .8rem; color: #8b949e; margin-bottom: 12px; }
    .branches { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
    .branch-tag { font-family: 'JetBrains Mono', monospace; font-size: .7rem; padding: 2px 8px; border-radius: 12px; background: #1f3a5f; color: #58a6ff; border: 1px solid #1f3a5f; cursor: pointer; }
    .branch-tag.active { background: #388bfd; color: #fff; border-color: #388bfd; }
    .last-commit { font-size: .75rem; color: #8b949e; }
    .last-commit .hash { font-family: 'JetBrains Mono', monospace; color: #f0883e; }
    .log-panel { background: #161b22; border: 1px solid #21262d; border-radius: 8px; overflow: hidden; }
    .log-header { padding: 14px 20px; border-bottom: 1px solid #21262d; display: flex; align-items: center; gap: 8px; font-size: .85rem; color: #8b949e; }
    .log-header .repo-label { font-family: 'JetBrains Mono', monospace; color: #58a6ff; }
    .log-header .branch-label { font-family: 'JetBrains Mono', monospace; color: #3fb950; }
    .commit-list { list-style: none; }
    .commit-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 20px; border-bottom: 1px solid #161b22; transition: background .15s; }
    .commit-item:hover { background: #1c2128; }
    .commit-dot { width: 10px; height: 10px; border-radius: 50%; background: #21262d; border: 2px solid #388bfd; margin-top: 5px; flex-shrink: 0; }
    .commit-line { flex: 1; min-width: 0; }
    .commit-subject { font-size: .875rem; color: #e6edf3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
    .commit-meta { font-size: .75rem; color: #8b949e; display: flex; gap: 10px; flex-wrap: wrap; }
    .commit-hash { font-family: 'JetBrains Mono', monospace; color: #f0883e; }
    .commit-author { color: #58a6ff; }
    .commit-time { color: #8b949e; }
    .loading { padding: 40px; text-align: center; color: #8b949e; font-size: .875rem; }
    .empty { padding: 40px; text-align: center; color: #8b949e; }
  </style>
</head>
<body>
  <header>
    <a href="/"><i class="fa fa-circle-nodes"></i> agora</a>
    <span style="color:#30363d">/</span>
    <span class="title">git <span>viewer</span></span>
  </header>
  <div class="container">
    <div class="repos" id="repos">
      <div class="loading"><i class="fa fa-spinner fa-spin"></i> loading...</div>
    </div>
    <div class="log-panel" id="log-panel" style="display:none">
      <div class="log-header">
        <i class="fa fa-code-branch"></i>
        <span class="repo-label" id="log-repo">—</span>
        <span style="color:#30363d">/</span>
        <span class="branch-label" id="log-branch">—</span>
      </div>
      <ul class="commit-list" id="commit-list">
        <li class="loading"><i class="fa fa-spinner fa-spin"></i> loading...</li>
      </ul>
    </div>
  </div>
  <script>
    const REPO_DESCS = {
      bibliotheke: '人格・存在テンプレート — 写本室',
      metroon: '共有スキル・スクリプト・データ — 公文書館',
    };
    let currentRepo = null, currentBranch = 'main';

    async function init() {
      const res = await fetch('/api/git/repos');
      const repos = await res.json();
      const el = document.getElementById('repos');
      el.innerHTML = repos.map(r => \`
        <div class="repo-card" id="card-\${r.name}" onclick="selectRepo('\${r.name}', 'main')">
          <div class="repo-name"><i class="fa fa-book-open"></i> \${r.name}</div>
          <div class="repo-desc">\${REPO_DESCS[r.name] || ''}</div>
          <div class="branches">\${r.branches.map(b => \`<span class="branch-tag\${b==='main'?' active':''}" onclick="event.stopPropagation();selectRepo('\${r.name}','\${b}')">\${b}</span>\`).join('')}</div>
          <div class="last-commit"><span class="hash">\${r.lastCommit.short || ''}</span> \${r.lastCommit.subject || ''} · <span>\${r.lastCommit.reltime || ''}</span></div>
        </div>
      \`).join('');
      if (repos.length > 0) selectRepo(repos[0].name, 'main');
    }

    async function selectRepo(repo, branch) {
      currentRepo = repo; currentBranch = branch;
      document.querySelectorAll('.repo-card').forEach(c => c.classList.remove('active'));
      const card = document.getElementById('card-' + repo);
      if (card) card.classList.add('active');
      document.querySelectorAll('.branch-tag').forEach(t => {
        t.classList.toggle('active', t.textContent === branch && t.closest('#card-' + repo));
      });
      document.getElementById('log-repo').textContent = repo;
      document.getElementById('log-branch').textContent = branch;
      document.getElementById('log-panel').style.display = '';
      document.getElementById('commit-list').innerHTML = '<li class="loading"><i class="fa fa-spinner fa-spin"></i> loading...</li>';
      const res = await fetch(\`/api/git/\${repo}/log?branch=\${branch}&limit=30\`);
      const data = await res.json();
      if (!data.commits || data.commits.length === 0) {
        document.getElementById('commit-list').innerHTML = '<li class="empty">コミットなし</li>';
        return;
      }
      document.getElementById('commit-list').innerHTML = data.commits.map(c => \`
        <li class="commit-item">
          <div class="commit-dot"></div>
          <div class="commit-line">
            <div class="commit-subject">\${c.subject || ''}</div>
            <div class="commit-meta">
              <span class="commit-hash">\${c.short}</span>
              <span class="commit-author"><i class="fa fa-user" style="font-size:.7em"></i> \${c.author}</span>
              <span class="commit-time"><i class="fa fa-clock" style="font-size:.7em"></i> \${c.reltime}</span>
            </div>
          </div>
        </li>
      \`).join('');
    }

    init();
  </script>
</body>
</html>`);
});
