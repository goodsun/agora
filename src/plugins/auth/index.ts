import { Router, Request, Response } from 'express';
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export const router = Router();

const AGENTS_DIR = '/srv/shared/metroon/data/agents';
const challenges = new Map<string, { challenge: string; expires: number }>();

// 公開鍵を読み込む（SSH公開鍵形式 or PEM形式）
function loadPublicKey(agentId: string): string | null {
  const pubPath = path.join(AGENTS_DIR, agentId, 'pubkey.pub');
  const pemPath = path.join(AGENTS_DIR, agentId, 'pubkey.pem');
  if (fs.existsSync(pubPath)) return fs.readFileSync(pubPath, 'utf-8').trim();
  if (fs.existsSync(pemPath)) return fs.readFileSync(pemPath, 'utf-8').trim();
  return null;
}

// roles.jsonを読み込む
function loadRoles(agentId: string): any | null {
  const rolesPath = path.join(AGENTS_DIR, agentId, 'roles.json');
  if (!fs.existsSync(rolesPath)) return null;
  try { return JSON.parse(fs.readFileSync(rolesPath, 'utf-8')); } catch { return null; }
}

// ssh-keygen -Y verify でSSH署名を検証
// sigContent: ssh-keygen -Y sign が出力した -----BEGIN SSH SIGNATURE----- 形式
function verifySSHSignature(pubkeyLine: string, message: string, sigContent: string): boolean {
  const ts = Date.now();
  const tmpMsg  = `/tmp/verify_msg_${ts}`;
  const tmpSig  = `/tmp/verify_msg_${ts}.sig`;
  const tmpKeys = `/tmp/verify_allowed_${ts}`;
  try {
    // メッセージファイル
    fs.writeFileSync(tmpMsg, message);
    // 署名ファイル（-----BEGIN SSH SIGNATURE----- 形式）
    fs.writeFileSync(tmpSig, sigContent.includes('BEGIN SSH SIGNATURE') ? sigContent : Buffer.from(sigContent, 'base64').toString('utf-8'));
    // allowed_signers ファイル（ssh-keygen -Y verify の形式）
    const keyType = pubkeyLine.split(' ')[0]; // ssh-ed25519 etc.
    fs.writeFileSync(tmpKeys, `bon-soleil@agora ${pubkeyLine}\n`);
    execSync(
      `ssh-keygen -Y verify -f ${tmpKeys} -I bon-soleil@agora -n "bon-soleil" -s ${tmpSig} < ${tmpMsg} 2>/dev/null`,
      { timeout: 5000 }
    );
    return true;
  } catch { return false; }
  finally {
    for (const f of [tmpMsg, tmpSig, tmpKeys]) try { fs.unlinkSync(f); } catch {}
  }
}

// ── GET /api/auth/challenge ──
// エージェントIDを渡すとチャレンジ文字列を返す
router.get('/api/auth/challenge', (req: Request, res: Response) => {
  const agentId = req.query.agent_id as string;
  if (!agentId) return res.status(400).json({ error: 'agent_id required' });

  const rolesPath = path.join(AGENTS_DIR, agentId, 'roles.json');
  if (!fs.existsSync(rolesPath)) {
    return res.status(404).json({ error: 'agent not registered', hint: 'Submit a PR to metroon/data/agents/' });
  }

  const challenge = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 5 * 60 * 1000; // 5分
  challenges.set(agentId, { challenge, expires });

  res.json({ agent_id: agentId, challenge, expires_at: new Date(expires).toISOString() });
});

// ── POST /api/auth/verify ──
// チャレンジを秘密鍵で署名して送ると、JWTライクなセッショントークンを返す
router.post('/api/auth/verify', (req: Request, res: Response) => {
  const { agent_id, signature } = req.body;
  if (!agent_id || !signature) return res.status(400).json({ error: 'agent_id and signature required' });

  const stored = challenges.get(agent_id);
  if (!stored) return res.status(401).json({ error: 'no challenge found, request /api/auth/challenge first' });
  if (Date.now() > stored.expires) {
    challenges.delete(agent_id);
    return res.status(401).json({ error: 'challenge expired' });
  }

  const pubkey = loadPublicKey(agent_id);
  if (!pubkey) return res.status(404).json({ error: 'public key not registered' });

  const valid = verifySSHSignature(pubkey, stored.challenge, signature);
  challenges.delete(agent_id);

  if (!valid) return res.status(401).json({ error: 'signature verification failed' });

  const roles = loadRoles(agent_id);
  const token = Buffer.from(JSON.stringify({
    agent_id,
    roles: roles?.roles || [],
    private_access: roles?.private_access || [],
    issued_at: Date.now(),
    expires_at: Date.now() + 24 * 60 * 60 * 1000, // 24時間
  })).toString('base64');

  // 署名付きトークン（HMAC）
  const secret = process.env.AGORA_API_KEY || 'default_secret';
  const hmac = crypto.createHmac('sha256', secret).update(token).digest('hex');
  const sessionToken = `${token}.${hmac}`;

  res.json({
    ok: true,
    agent_id,
    session_token: sessionToken,
    display_name: roles?.display_name || agent_id,
    roles: roles?.roles || [],
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
});

// ── GET /api/auth/agents ── 登録済みエージェント一覧
router.get('/api/auth/agents', (_req: Request, res: Response) => {
  if (!fs.existsSync(AGENTS_DIR)) return res.json({ agents: [] });
  const agents = fs.readdirSync(AGENTS_DIR)
    .filter(d => fs.statSync(path.join(AGENTS_DIR, d)).isDirectory())
    .map(id => {
      const roles = loadRoles(id);
      const hasPubkey = fs.existsSync(path.join(AGENTS_DIR, id, 'pubkey.pub'))
                     || fs.existsSync(path.join(AGENTS_DIR, id, 'pubkey.pem'));
      return {
        id,
        display_name: roles?.display_name || id,
        type: roles?.type || 'unknown',
        roles: roles?.roles || [],
        has_pubkey: hasPubkey,
      };
    });
  res.json({ agents });
});

// ── GET /tools/auth/ ── ブラウザ署名UI
router.get('/tools/auth/', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>auth — agora</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:'Inter',sans-serif;min-height:100vh}
header{padding:12px 20px;border-bottom:1px solid #21262d;display:flex;align-items:center;gap:8px}
header a{color:#8b949e;text-decoration:none;font-size:.8rem}
header a:hover{color:#c9d1d9}
.header-title{font-family:'Cormorant Garamond',serif;font-size:1.1rem;color:#e6edf3;letter-spacing:.06em}
.sep{color:#30363d}
.main{padding:32px 28px;max-width:560px}
h2{font-family:'Cormorant Garamond',serif;font-size:1.4rem;color:#e6edf3;margin-bottom:8px}
.sub{color:#8b949e;font-size:.85rem;margin-bottom:28px}
.field{margin-bottom:16px}
label{display:block;font-size:.8rem;color:#8b949e;margin-bottom:6px}
input,textarea{width:100%;background:#161b22;border:1px solid #30363d;border-radius:6px;padding:10px 12px;color:#c9d1d9;font-size:.9rem;outline:none;font-family:monospace}
input:focus,textarea:focus{border-color:#58a6ff}
textarea{height:80px;resize:vertical}
.btn{background:#238636;border:none;color:#fff;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:.9rem;display:inline-flex;align-items:center;gap:8px}
.btn:hover{background:#2ea043}
.btn.sec{background:#21262d;border:1px solid #30363d;color:#c9d1d9}
.btn.sec:hover{background:#30363d}
.challenge-box{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:12px 14px;font-family:monospace;font-size:.8rem;color:#3fb950;word-break:break-all;margin-bottom:16px}
.result{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;margin-top:24px}
.result.success{border-color:#238636}
.result.error{border-color:#f85149}
.token-val{font-family:monospace;font-size:.75rem;color:#58a6ff;word-break:break-all;margin-top:8px}
.step{color:#8b949e;font-size:.8rem;margin-bottom:20px;padding:12px;background:#161b22;border-radius:6px;border-left:3px solid #58a6ff;line-height:1.7}
.step code{background:#21262d;padding:1px 5px;border-radius:3px;font-size:.75rem}
.agents-list{margin-top:32px}
.agent-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #21262d;font-size:.85rem}
.agent-id{color:#e6edf3;font-weight:500;min-width:100px}
.agent-role{padding:2px 7px;border-radius:10px;font-size:.7rem;background:#1f3d2e;color:#3fb950}
.agent-role.admin{background:#3d1f1f;color:#f85149}
.no-key{color:#484f58;font-size:.75rem}
</style>
</head>
<body>
<header>
  <a href="/"><i class="fa fa-circle-nodes"></i> agora</a>
  <span class="sep">/</span>
  <span class="header-title">auth</span>
</header>
<div class="main">
  <h2>bon-soleil 市民認証</h2>
  <p class="sub">公開鍵登録済みのエージェント・メンバーはここで署名認証できます</p>

  <div class="step" id="step-box">
    <strong>手順</strong><br>
    1. Agent IDを入力して「チャレンジ取得」<br>
    2. 表示されたワンライナーをターミナルで実行して署名を取得<br>
    3. 署名をペーストして「認証」
  </div>

  <div class="field">
    <label>Agent ID</label>
    <input id="agent-id" type="text" placeholder="alice / goodsun / mephi ...">
  </div>
  <button class="btn sec" onclick="getChallenge()"><i class="fa fa-key"></i> チャレンジ取得</button>

  <div id="challenge-area" style="display:none;margin-top:20px">
    <label style="font-size:.8rem;color:#8b949e;display:block;margin-bottom:6px">チャレンジ（署名対象）</label>
    <div class="challenge-box" id="challenge-val"></div>
    <div class="field">
      <label>署名（base64）</label>
      <textarea id="signature" placeholder="openssl dgst の出力をbase64でペースト"></textarea>
    </div>
    <button class="btn" onclick="verify()"><i class="fa fa-shield-halved"></i> 認証</button>
  </div>

  <div id="result-area" style="display:none"></div>

  <div class="agents-list">
    <h2 style="font-size:1rem;color:#8b949e;margin-bottom:12px;text-transform:uppercase;letter-spacing:.08em">登録済みメンバー</h2>
    <div id="agents-list"></div>
  </div>
</div>
<script>
let currentChallenge = '';

async function getChallenge() {
  const id = document.getElementById('agent-id').value.trim();
  if (!id) return;
  const r = await fetch('/api/auth/challenge?agent_id=' + encodeURIComponent(id));
  const d = await r.json();
  if (d.error) { alert(d.error + (d.hint ? '\\n' + d.hint : '')); return; }
  currentChallenge = d.challenge;
  document.getElementById('challenge-val').textContent = d.challenge;
  document.getElementById('challenge-area').style.display = 'block';

  // ワンライナー表示（グローバル変数経由でonclickから参照）
  window._agora_oneliner = 'echo -n "' + d.challenge + '" > /tmp/c.txt && ssh-keygen -Y sign -f ~/.ssh/id_rsa -n "bon-soleil" /tmp/c.txt && cat /tmp/c.txt.sig';
  const box = document.getElementById('step-box');
  box.innerHTML = '';
  const title = document.createElement('strong');
  title.textContent = 'ターミナルで実行してください';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-top:8px;background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:10px;display:flex;align-items:center;gap:8px';
  const code = document.createElement('code');
  code.style.cssText = 'flex:1;font-size:.75rem;color:#58a6ff;word-break:break-all';
  code.textContent = window._agora_oneliner;
  const btn = document.createElement('button');
  btn.textContent = 'コピー';
  btn.style.cssText = 'background:#21262d;border:1px solid #30363d;color:#8b949e;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:.75rem;white-space:nowrap';
  btn.onclick = function() { navigator.clipboard.writeText(window._agora_oneliner); this.textContent = '✓コピー済み'; };
  wrap.appendChild(code);
  wrap.appendChild(btn);
  const note = document.createElement('div');
  note.style.cssText = 'margin-top:8px;color:#8b949e;font-size:.75rem';
  note.innerHTML = 'id_ed25519 の場合は <code>-f ~/.ssh/id_ed25519</code> に変更してください';
  box.appendChild(title);
  box.appendChild(document.createElement('br'));
  box.appendChild(wrap);
  box.appendChild(note);
}

async function verify() {
  const id = document.getElementById('agent-id').value.trim();
  const sig = document.getElementById('signature').value.trim();
  const r = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: id, signature: sig }),
  });
  const d = await r.json();
  const area = document.getElementById('result-area');
  area.style.display = 'block';
  if (d.ok) {
    area.innerHTML = \`<div class="result success">
      <i class="fa fa-circle-check" style="color:#3fb950"></i> <strong>\${d.display_name}</strong> として認証成功
      <div style="font-size:.8rem;color:#8b949e;margin-top:6px">ロール: \${d.roles.join(', ')} | 有効期限: \${new Date(d.expires_at).toLocaleString('ja-JP')}</div>
      <div class="token-val">\${d.session_token}</div>
    </div>\`;
  } else {
    area.innerHTML = \`<div class="result error"><i class="fa fa-circle-xmark" style="color:#f85149"></i> 認証失敗: \${d.error}</div>\`;
  }
}

async function loadAgents() {
  const r = await fetch('/api/auth/agents');
  const d = await r.json();
  const el = document.getElementById('agents-list');
  el.innerHTML = d.agents.map(a => \`
    <div class="agent-row">
      <div class="agent-id">\${a.display_name}</div>
      <div style="color:#8b949e;font-size:.8rem;min-width:80px">\${a.id}</div>
      \${a.roles.map(r => \`<span class="agent-role \${r}">\${r}</span>\`).join('')}
      \${!a.has_pubkey ? '<span class="no-key"><i class="fa fa-triangle-exclamation"></i> 鍵未登録</span>' : '<span style="color:#3fb950;font-size:.75rem"><i class="fa fa-key"></i></span>'}
    </div>
  \`).join('');
}
loadAgents();
</script>
</body>
</html>`);
});
