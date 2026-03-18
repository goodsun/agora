import { Router } from 'express';
import { execSync } from 'child_process';

export const router = Router();

interface ServiceEntry {
  name: string;
  description: string;
  user: string;
  port?: number;
  status: 'active' | 'inactive' | 'failed' | 'unknown';
  source: 'systemd' | 'process' | 'both';
  pid?: number;
  url?: string;
}

function getPidPort(pid: number): number | undefined {
  try {
    const ss = execSync(`sudo ss -tlnp 2>/dev/null | grep "pid=${pid},"`, { encoding: 'utf-8' });
    const m = ss.match(/:(\d{4,5})\s/);
    return m ? parseInt(m[1]) : undefined;
  } catch { return undefined; }
}

function getSystemdServices(): ServiceEntry[] {
  try {
    const out = execSync(
      `systemctl list-units --all --type=service --no-pager --no-legend 2>/dev/null | grep -E "agora|bizeny|openclaw|labo|monolith|ragmy|xpathgenie|siegengin"`,
      { encoding: 'utf-8' }
    );
    const services: ServiceEntry[] = [];
    for (const line of out.trim().split('\n')) {
      if (!line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      const name = parts[0].replace('.service', '');
      const status = parts[2] === 'active' ? 'active' : parts[2] === 'failed' ? 'failed' : 'inactive';
      const description = parts.slice(4).join(' ');
      let user = 'unknown';
      let port: number | undefined;
      let pid: number | undefined;
      try {
        const show = execSync(`systemctl show ${name}.service --property=User,MainPID 2>/dev/null`, { encoding: 'utf-8' });
        const userMatch = show.match(/^User=(.+)$/m);
        if (userMatch && userMatch[1].trim()) user = userMatch[1].trim();
        const pidMatch = show.match(/^MainPID=(\d+)$/m);
        if (pidMatch) {
          pid = parseInt(pidMatch[1]);
          if (pid > 0) port = getPidPort(pid);
        }
      } catch {}
      services.push({ name, description, user, port, pid, status: status as any, source: 'systemd' });
    }
    return services;
  } catch { return []; }
}

function getWildProcesses(systemdNames: string[]): ServiceEntry[] {
  try {
    // psでflask/uvicorn/node dist/python.*app.pyを取得
    const out = execSync(
      `ps aux | grep -E "flask|node dist|uvicorn|python.*app\\.py|python.*webapp\\.py" | grep -v grep`,
      { encoding: 'utf-8' }
    );
    const wilds: ServiceEntry[] = [];
    for (const line of out.trim().split('\n')) {
      if (!line.trim()) continue;
      const cols = line.trim().split(/\s+/);
      const user = cols[0];
      const pid = parseInt(cols[1]);
      const cmd = cols.slice(10).join(' ');

      // ポート取得
      let port: number | undefined;
      try {
        const ss = execSync(`sudo ss -tlnp 2>/dev/null | grep "pid=${pid},"`, { encoding: 'utf-8' });
        const m = ss.match(/:(\d+)\s/);
        if (m) port = parseInt(m[1]);
      } catch {}

      // プロジェクト名を推定
      const projMatch = cmd.match(/projects\/([^/]+)\//);
      const name = projMatch ? projMatch[1] : `pid-${pid}`;

      // systemd管理済みのものはスキップ（ポートで照合）
      const isManaged = systemdNames.some(n => n.toLowerCase().includes(name.toLowerCase()));
      if (isManaged) continue;

      wilds.push({
        name,
        description: cmd.slice(0, 80),
        user,
        port,
        pid,
        status: 'active',
        source: 'process',
      });
    }
    return wilds;
  } catch { return []; }
}

// ポートからURL推定
function inferUrl(name: string, port?: number): string | undefined {
  if (!port) return undefined;
  const knownDomains: Record<string, string> = {
    '8810': 'https://agora.bon-soleil.com',
    '8793': 'https://monolith.bon-soleil.com',
    '8789': 'https://corp.bon-soleil.com/xpathgenie',
    '8792': 'https://staff.bon-soleil.com/ragmyadmin',
    '8788': 'https://corp.bon-soleil.com/bizeny',
  };
  return knownDomains[String(port)] || `http://localhost:${port}`;
}

// API
router.get('/api/services', (_req, res) => {
  const systemd = getSystemdServices();
  const systemdNames = systemd.map(s => s.name);
  const wilds = getWildProcesses(systemdNames);

  const all: ServiceEntry[] = [
    ...systemd.map(s => ({ ...s, url: inferUrl(s.name, s.port) })),
    ...wilds.map(s => ({ ...s, url: inferUrl(s.name, s.port) })),
  ];

  res.json({ services: all, count: all.length, scannedAt: new Date().toISOString() });
});

// UI
router.get('/tools/services/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>services — agora</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:'Inter',sans-serif;min-height:100vh;padding:0}
header{padding:12px 20px;border-bottom:1px solid #21262d;display:flex;align-items:center;gap:8px;background:#0d1117}
header a{color:#8b949e;text-decoration:none;font-size:.8rem}
header a:hover{color:#c9d1d9}
.header-title{font-family:'Cormorant Garamond',serif;font-size:1.1rem;color:#e6edf3;letter-spacing:.06em}
.sep{color:#30363d}
.main{padding:24px 28px;max-width:900px}
h2{font-size:.75rem;text-transform:uppercase;letter-spacing:.1em;color:#8b949e;margin-bottom:14px;padding-bottom:6px;border-bottom:1px solid #21262d}
.service-list{display:flex;flex-direction:column;gap:8px;margin-bottom:32px}
.card{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:14px 18px;display:flex;align-items:center;gap:14px;transition:border-color .15s}
.card:hover{border-color:#30363d}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.dot.active{background:#3fb950}
.dot.inactive{background:#484f58}
.dot.failed{background:#f85149}
.dot.unknown{background:#e3b341}
.sname{font-weight:500;color:#e6edf3;font-size:.9rem;min-width:160px}
.sdesc{color:#8b949e;font-size:.8rem;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.smeta{display:flex;align-items:center;gap:10px;font-size:.75rem;color:#6e7681;flex-shrink:0}
.badge{padding:2px 7px;border-radius:10px;font-size:.7rem;font-weight:500}
.badge.systemd{background:#1f3d2e;color:#3fb950}
.badge.process{background:#2d2209;color:#e3b341}
.sport{color:#58a6ff;font-family:monospace}
.suser{color:#8b949e}
.slink{color:#58a6ff;text-decoration:none;font-size:.75rem}
.slink:hover{text-decoration:underline}
.refresh-btn{background:#21262d;border:1px solid #30363d;color:#8b949e;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:.8rem;display:flex;align-items:center;gap:6px}
.refresh-btn:hover{color:#c9d1d9;border-color:#484f58}
.toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.scan-time{font-size:.75rem;color:#484f58}
</style>
</head>
<body>
<header>
  <a href="/"><i class="fa fa-circle-nodes"></i> agora</a>
  <span class="sep">/</span>
  <span class="header-title">services</span>
</header>
<div class="main">
  <div class="toolbar">
    <div class="scan-time" id="scan-time">読み込み中...</div>
    <button class="refresh-btn" onclick="load()"><i class="fa fa-rotate-right"></i> 再スキャン</button>
  </div>
  <h2><i class="fa fa-circle-check" style="color:#3fb950;margin-right:6px"></i>systemd 管理サービス</h2>
  <div class="service-list" id="systemd-list"></div>
  <h2><i class="fa fa-triangle-exclamation" style="color:#e3b341;margin-right:6px"></i>プロセススキャン（野良）</h2>
  <div class="service-list" id="process-list"></div>
</div>
<script>
async function load() {
  document.getElementById('scan-time').textContent = 'スキャン中...';
  const r = await fetch('/api/services');
  const d = await r.json();
  const sysEl = document.getElementById('systemd-list');
  const procEl = document.getElementById('process-list');
  sysEl.innerHTML = '';
  procEl.innerHTML = '';

  const systemd = d.services.filter(s => s.source === 'systemd');
  const procs   = d.services.filter(s => s.source === 'process');

  function card(s) {
    return \`<div class="card">
      <div class="dot \${s.status}"></div>
      <div class="sname">\${s.name}</div>
      <div class="sdesc">\${s.description || ''}</div>
      <div class="smeta">
        \${s.port ? \`<span class="sport">:\${s.port}</span>\` : ''}
        <span class="suser">\${s.user}</span>
        <span class="badge \${s.source}">\${s.source}</span>
        \${s.url ? \`<a href="\${s.url}" target="_blank" class="slink"><i class="fa fa-arrow-up-right-from-square"></i></a>\` : ''}
      </div>
    </div>\`;
  }

  if (systemd.length === 0) sysEl.innerHTML = '<div style="color:#484f58;font-size:.85rem;padding:8px">なし</div>';
  else sysEl.innerHTML = systemd.map(card).join('');

  if (procs.length === 0) procEl.innerHTML = '<div style="color:#484f58;font-size:.85rem;padding:8px">なし（全プロセスがsystemd管理）</div>';
  else procEl.innerHTML = procs.map(card).join('');

  const t = new Date(d.scannedAt).toLocaleTimeString('ja-JP');
  document.getElementById('scan-time').textContent = \`最終スキャン: \${t} — \${d.count}件\`;
}
load();
</script>
</body>
</html>`);
});
