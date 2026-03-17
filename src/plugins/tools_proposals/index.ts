import { Router } from 'express';
import path from 'path';
import fs from 'fs';

export const proposalsRouter = Router();

const PROPOSALS_DIR = path.join(__dirname, '../../../proposals');

const STATUS_ICONS: Record<string, string> = {
  '提案中': '📋',
  '検討中': '🔄',
  '採用':   '✅',
  '却下':   '❌',
  'Draft':  '📋',
  'WIP':    '🔄',
  'Accepted': '✅',
  'Rejected': '❌',
};

const STATUS_COLORS: Record<string, string> = {
  '提案中': '#388bfd', '検討中': '#f0883e', '採用': '#3fb950', '却下': '#f85149',
  'Draft': '#388bfd', 'WIP': '#f0883e', 'Accepted': '#3fb950', 'Rejected': '#f85149',
};

function parseProposal(filepath: string) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');
  const filename = path.basename(filepath, '.md');

  // タイトル: 最初の # 行
  const titleLine = lines.find(l => l.startsWith('# '));
  const title = titleLine?.replace(/^#\s*/, '') || filename;

  // 提案者
  const authorLine = lines.find(l => /提案者|Author/.test(l));
  const author = authorLine?.replace(/.*[:：]\s*/, '').trim() || '—';

  // 日付
  const dateLine = lines.find(l => /^[- *]*(?:日付|Date)/.test(l));
  const date = dateLine?.replace(/.*[:：]\s*/, '').trim() || '';

  // ステータス: 末尾の「提案ステータス:」行 or Status行
  const statusLine = lines.find(l => /提案ステータス|^\*\*Status/.test(l));
  let status = '提案中';
  if (statusLine) {
    const m = statusLine.match(/📋|🔄|✅|❌/);
    if (m) {
      const map: Record<string, string> = { '📋': '提案中', '🔄': '検討中', '✅': '採用', '❌': '却下' };
      status = map[m[0]] || '提案中';
    } else {
      const s = statusLine.replace(/.*[:：]\s*/, '').trim().replace(/\*+/g, '');
      status = s || '提案中';
    }
  }

  // 概要: 最初の ## 以降の最初の段落
  const firstH2 = lines.findIndex(l => l.startsWith('## '));
  let summary = '';
  if (firstH2 >= 0) {
    for (let i = firstH2 + 1; i < Math.min(firstH2 + 10, lines.length); i++) {
      const l = lines[i].trim();
      if (l && !l.startsWith('#')) { summary = l.replace(/[*_`]/g, ''); break; }
    }
  }

  return { filename, title, author, date, status, summary };
}

// API: GET /api/proposals
proposalsRouter.get('/', (_req, res) => {
  if (!fs.existsSync(PROPOSALS_DIR)) return res.json([]);
  const files = fs.readdirSync(PROPOSALS_DIR)
    .filter(f => f.endsWith('.md') && f !== 'README.md' && f !== 'template.md')
    .sort();
  const proposals = files.map(f => parseProposal(path.join(PROPOSALS_DIR, f)));
  res.json(proposals);
});

// UI: GET /tools/proposals/
proposalsRouter.get('/ui', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>agora — proposals</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d1117; color: #c9d1d9; font-family: 'Inter', sans-serif; min-height: 100vh; }
    header { padding: 20px 32px; border-bottom: 1px solid #21262d; display: flex; align-items: center; gap: 12px; }
    header a { color: #8b949e; text-decoration: none; font-size: .85rem; }
    header a:hover { color: #c9d1d9; }
    .title { font-family: 'Cormorant Garamond', serif; font-size: 1.4rem; color: #e6edf3; letter-spacing: .08em; }
    .title span { color: #8b949e; font-size: .9em; }
    .container { max-width: 860px; margin: 0 auto; padding: 32px; }
    .filter-bar { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
    .filter-btn { padding: 4px 14px; border-radius: 20px; border: 1px solid #30363d; background: transparent; color: #8b949e; cursor: pointer; font-size: .8rem; transition: all .15s; }
    .filter-btn:hover, .filter-btn.active { background: #21262d; color: #e6edf3; border-color: #8b949e; }
    .proposal-list { display: flex; flex-direction: column; gap: 12px; }
    .proposal-card { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 18px 20px; border-left: 3px solid #30363d; transition: border-color .2s; }
    .proposal-card:hover { border-left-color: #388bfd; }
    .card-header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
    .status-badge { font-size: .7rem; padding: 2px 10px; border-radius: 12px; background: #21262d; white-space: nowrap; flex-shrink: 0; margin-top: 2px; }
    .proposal-title { font-size: .95rem; color: #e6edf3; font-weight: 500; flex: 1; }
    .proposal-summary { font-size: .8rem; color: #8b949e; line-height: 1.5; margin-bottom: 8px; }
    .proposal-meta { font-size: .75rem; color: #8b949e; display: flex; gap: 12px; flex-wrap: wrap; }
    .proposal-meta .author { color: #58a6ff; }
    .loading { padding: 40px; text-align: center; color: #8b949e; }
    .empty { padding: 40px; text-align: center; color: #8b949e; }
    .count { font-size: .8rem; color: #8b949e; margin-bottom: 16px; }
  </style>
</head>
<body>
  <header>
    <a href="/"><i class="fa fa-circle-nodes"></i> agora</a>
    <span style="color:#30363d">/</span>
    <span class="title">proposals</span>
  </header>
  <div class="container">
    <div class="filter-bar">
      <button class="filter-btn active" onclick="setFilter('all',this)">All</button>
      <button class="filter-btn" onclick="setFilter('提案中',this)">📋 提案中</button>
      <button class="filter-btn" onclick="setFilter('検討中',this)">🔄 検討中</button>
      <button class="filter-btn" onclick="setFilter('採用',this)">✅ 採用</button>
      <button class="filter-btn" onclick="setFilter('却下',this)">❌ 却下</button>
    </div>
    <div class="count" id="count"></div>
    <div class="proposal-list" id="list">
      <div class="loading"><i class="fa fa-spinner fa-spin"></i> loading...</div>
    </div>
  </div>
  <script>
    const STATUS_COLORS = { '提案中':'#388bfd','検討中':'#f0883e','採用':'#3fb950','却下':'#f85149','Draft':'#388bfd','WIP':'#f0883e','Accepted':'#3fb950','Rejected':'#f85149' };
    const STATUS_LABELS = { 'Draft':'📋 提案中','WIP':'🔄 検討中','Accepted':'✅ 採用','Rejected':'❌ 却下','提案中':'📋 提案中','検討中':'🔄 検討中','採用':'✅ 採用','却下':'❌ 却下' };
    let all = [], currentFilter = 'all';

    async function init() {
      const res = await fetch('/api/proposals');
      all = await res.json();
      render();
    }

    function setFilter(f, btn) {
      currentFilter = f;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    }

    function render() {
      const filtered = currentFilter === 'all' ? all : all.filter(p => p.status === currentFilter || (currentFilter==='提案中' && (p.status==='Draft'||p.status==='提案中')));
      document.getElementById('count').textContent = filtered.length + ' 件';
      if (!filtered.length) { document.getElementById('list').innerHTML = '<div class="empty">該当なし</div>'; return; }
      document.getElementById('list').innerHTML = filtered.map(p => {
        const color = STATUS_COLORS[p.status] || '#8b949e';
        const label = STATUS_LABELS[p.status] || p.status;
        return \`<div class="proposal-card" style="border-left-color:\${color}20">
          <div class="card-header">
            <span class="status-badge" style="color:\${color};border:1px solid \${color}30">\${label}</span>
            <div class="proposal-title">\${p.title}</div>
          </div>
          \${p.summary ? \`<div class="proposal-summary">\${p.summary}</div>\` : ''}
          <div class="proposal-meta">
            <span class="author"><i class="fa fa-user" style="font-size:.7em"></i> \${p.author}</span>
            \${p.date ? \`<span><i class="fa fa-calendar" style="font-size:.7em"></i> \${p.date}</span>\` : ''}
            <span style="font-family:monospace;font-size:.7rem;color:#8b949e">\${p.filename}</span>
          </div>
        </div>\`;
      }).join('');
    }

    init();
  </script>
</body>
</html>`);
});
