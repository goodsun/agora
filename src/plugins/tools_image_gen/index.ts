import { Router } from 'express';
import path from 'path';
import fs from 'fs';

export const toolsImageGenRouter = Router();

const AGORA_ROOT = path.resolve(__dirname, '../../..');
const CASTS_DIR = path.join(AGORA_ROOT, 'casts');

function loadTouchPresets() {
  try {
    const f = path.join(AGORA_ROOT, 'data/image_gen/touch_presets.json');
    return JSON.parse(fs.readFileSync(f, 'utf-8'));
  } catch { return { presets: [], default: '' }; }
}

function loadCasts() {
  if (!fs.existsSync(CASTS_DIR)) return [];
  return fs.readdirSync(CASTS_DIR)
    .filter(d => fs.statSync(path.join(CASTS_DIR, d)).isDirectory())
    .flatMap(id => {
      try {
        const profile = JSON.parse(fs.readFileSync(path.join(CASTS_DIR, id, 'profile.json'), 'utf-8'));
        const styles: Record<string, any> = {};
        for (const [sk, sv] of Object.entries(profile.styles || {})) {
          const imgFile = (sv as any).image;
          const imgUrl = imgFile && fs.existsSync(path.join(CASTS_DIR, id, imgFile))
            ? `/casts/${id}/${imgFile}` : '';
          styles[sk] = { ...(sv as any), imageUrl: imgUrl };
        }
        return [{ id, name: profile.name || id, emoji: profile.emoji || '', default_style: profile.default_style || 'normal', styles }];
      } catch { return []; }
    });
}

toolsImageGenRouter.get('/', (_req, res) => {
  const casts = loadCasts();
  const castsJson = JSON.stringify(casts);
  const touchData = loadTouchPresets();
  const touchPresetsJson = JSON.stringify(touchData.presets);
  const touchDefault = touchData.default || 'manga_warm';

  res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>image_gen — agora</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0a0e1a;color:#e0e6f0;font-family:'Segoe UI',sans-serif;min-height:100vh;padding:2rem}
    h1{font-size:1.4rem;font-weight:300;letter-spacing:.15em;color:#c8b8ff;margin-bottom:.3rem}
    .subtitle{font-size:.8rem;color:#445566;margin-bottom:2rem}
    .layout{display:grid;grid-template-columns:320px 1fr;gap:1.5rem;max-width:1100px}
    .panel{background:#111827;border:1px solid #1e2d4a;border-radius:8px;padding:1.2rem}
    .panel h2{font-size:.85rem;font-weight:600;color:#7a8aaa;letter-spacing:.1em;margin-bottom:1rem;text-transform:uppercase}
    label{font-size:.8rem;color:#7a8aaa;display:block;margin-bottom:.3rem}
    textarea,select,input[type=text]{width:100%;background:#0d1117;border:1px solid #1e2d4a;border-radius:5px;color:#e0e6f0;padding:.6rem .8rem;font-size:.85rem;outline:none;resize:vertical}
    textarea{min-height:100px}
    textarea:focus,select:focus,input:focus{border-color:#4466aa}
    .form-group{margin-bottom:1rem}
    .cast-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-bottom:1rem;max-height:280px;overflow-y:auto}
    .cast-card{background:#0d1117;border:1px solid #1e2d4a;border-radius:6px;padding:.5rem;cursor:pointer;transition:.15s;text-align:center}
    .cast-card:hover{border-color:#4466aa}
    .cast-card.selected{border-color:#6644cc;background:#1a1030}
    .cast-card img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px;background:#16213e}
    .cast-card .cname{font-size:.72rem;margin-top:.3rem;color:#aabbcc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .style-select{width:100%;margin-top:.3rem;font-size:.72rem;padding:.25rem .4rem}
    .selected-list{min-height:40px;background:#0d1117;border:1px solid #1e2d4a;border-radius:5px;padding:.5rem;font-size:.8rem;color:#7a8aaa;margin-bottom:1rem}
    .sel-item{display:inline-flex;align-items:center;gap:.4rem;background:#1a1030;border:1px solid #4422aa;border-radius:4px;padding:.2rem .5rem;margin:.2rem;font-size:.75rem}
    .sel-item button{background:none;border:none;color:#aa6688;cursor:pointer;font-size:.9rem;line-height:1}
    .btn{width:100%;padding:.75rem;background:linear-gradient(135deg,#4422aa,#2244cc);border:none;border-radius:6px;color:#fff;font-size:.9rem;cursor:pointer;transition:.15s;letter-spacing:.05em}
    .btn:hover{opacity:.85}
    .btn:disabled{opacity:.4;cursor:not-allowed}
    .result-area{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;background:#0d1117;border:1px solid #1e2d4a;border-radius:8px}
    .result-area img{max-width:100%;border-radius:6px}
    .placeholder{color:#334455;font-size:.9rem;text-align:center}
    .placeholder i{font-size:3rem;display:block;margin-bottom:1rem;color:#1e2d4a}
    .spinner{display:none;flex-direction:column;align-items:center;gap:1rem;color:#7a8aaa}
    .spinner i{font-size:2rem;animation:spin 1s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .api-key-row{display:flex;gap:.5rem;align-items:center;margin-bottom:1.5rem}
    .api-key-row input{flex:1;font-family:monospace;font-size:.75rem}
    .api-key-row .lock{font-size:.8rem;color:#556677;flex-shrink:0}
    .model-aspect{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
    a.back{font-size:.8rem;color:#445566;text-decoration:none;display:inline-block;margin-bottom:1.5rem}
    a.back:hover{color:#7a8aaa}
  </style>
</head>
<body>
  <a href="/" class="back"><i class="fa fa-arrow-left"></i> agora</a>
  <h1><i class="fa fa-palette"></i> image_gen</h1>
  <p class="subtitle">agora 共通画像生成 UI</p>

  <div class="api-key-row">
    <i class="fa fa-key lock"></i>
    <input type="password" id="apiKey" placeholder="X-API-Key を入力">
  </div>

  <div class="layout">
    <div>
      <div class="panel" style="margin-bottom:1rem">
        <h2>キャラクター選択</h2>
        <div class="cast-grid" id="castGrid"></div>
        <div id="selectedList" class="selected-list">キャラ未選択</div>
      </div>
      <div class="panel">
        <h2>生成設定</h2>
        <div class="form-group">
          <label>画風・タッチ</label>
          <select id="touch"></select>
        </div>
        <div class="form-group">
          <label>プロンプト</label>
          <textarea id="prompt" placeholder="シーンや状況を日本語・英語で入力..."></textarea>
        </div>
        <div class="model-aspect form-group">
          <div>
            <label>モデル</label>
            <select id="model">
              <option value="gemini-3-pro-image-preview">gemini-3-pro (高品質)</option>
              <option value="gemini-2.5-flash-image" selected>gemini-2.5-flash (速い)</option>
            </select>
          </div>
          <div>
            <label>アスペクト比</label>
            <select id="aspect">
              <option value="1:1" selected>1:1 (正方形)</option>
              <option value="9:16">9:16 (縦)</option>
              <option value="16:9">16:9 (横)</option>
              <option value="4:3">4:3</option>
              <option value="3:4">3:4</option>
            </select>
          </div>
        </div>
        <button class="btn" id="genBtn" onclick="generate()">
          <i class="fa fa-wand-magic-sparkles"></i> 生成
        </button>
      </div>
    </div>

    <div class="result-area" id="resultArea">
      <div class="placeholder">
        <i class="fa fa-image"></i>
        生成した画像がここに表示されます
      </div>
      <div class="spinner" id="spinner">
        <i class="fa fa-circle-notch"></i>
        生成中...
      </div>
    </div>
  </div>

<script>
const casts = ${castsJson};
const touchPresets = ${touchPresetsJson};
const touchDefault = '${touchDefault}';
const selected = []; // [{id, style, label}]
const LABELS = 'ABCDEFGHIJ'.split('');

function renderCastGrid() {
  const grid = document.getElementById('castGrid');
  grid.innerHTML = casts.map(c => {
    const defStyle = c.default_style || Object.keys(c.styles||{})[0] || 'normal';
    const styleData = (c.styles||{})[defStyle] || {};
    const imgUrl = styleData.imageUrl || '';
    const isSelected = selected.some(s => s.id === c.id);
    return \`<div class="cast-card \${isSelected?'selected':''}" id="card_\${c.id}" onclick="toggleCast('\${c.id}')">
      \${imgUrl ? \`<img src="\${imgUrl}" alt="\${c.name}" loading="lazy">\` : '<div style="width:100%;aspect-ratio:1;background:#16213e;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:1.5rem">👤</div>'}
      <div class="cname">\${c.name}</div>
      <select class="style-select" id="style_\${c.id}" onchange="updateStyle('\${c.id}',this.value)" onclick="event.stopPropagation()">
        \${Object.entries(c.styles||{}).map(([k,v])=>\`<option value="\${k}" \${k===defStyle?'selected':''}>\${v.description||k}</option>\`).join('')}
      </select>
    </div>\`;
  }).join('');
}

function toggleCast(id) {
  const idx = selected.findIndex(s => s.id === id);
  if (idx >= 0) {
    selected.splice(idx, 1);
  } else if (selected.length < 10) {
    const style = document.getElementById('style_'+id)?.value || 'normal';
    selected.push({ id, style, label: LABELS[selected.length] });
  }
  renderCastGrid();
  renderSelected();
}

function updateStyle(id, style) {
  const s = selected.find(s => s.id === id);
  if (s) s.style = style;
}

function removeCast(id) {
  const idx = selected.findIndex(s => s.id === id);
  if (idx >= 0) selected.splice(idx, 1);
  selected.forEach((s,i) => s.label = LABELS[i]);
  renderCastGrid();
  renderSelected();
}

function renderSelected() {
  const el = document.getElementById('selectedList');
  if (!selected.length) { el.textContent = 'キャラ未選択'; return; }
  el.innerHTML = selected.map(s => {
    const c = casts.find(c => c.id === s.id);
    return \`<span class="sel-item">\${s.label}: \${c?.name||s.id}<button onclick="removeCast('\${s.id}')">×</button></span>\`;
  }).join('');
}

function renderTouchPresets() {
  const sel = document.getElementById('touch');
  sel.innerHTML = '<option value="">— タッチ指定なし —</option>' +
    touchPresets.map(t => \`<option value="\${t.id}" \${t.id===touchDefault?'selected':''}>\${t.label}</option>\`).join('');
}

async function generate() {
  const prompt = document.getElementById('prompt').value.trim();
  if (!prompt) { alert('プロンプトを入力してください'); return; }
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) { alert('API Keyを入力してください'); return; }

  const btn = document.getElementById('genBtn');
  const spinner = document.getElementById('spinner');
  const resultArea = document.getElementById('resultArea');

  btn.disabled = true;
  resultArea.querySelector('.placeholder')?.remove();
  resultArea.querySelector('img')?.remove();
  spinner.style.display = 'flex';

  const castRefs = selected.map(s => ({ id: s.id, style: s.style, label: s.label }));

  // タッチプリセットのpromptを合成
  const touchId = document.getElementById('touch').value;
  const touchPrompt = touchPresets.find(t => t.id === touchId)?.prompt || '';
  const finalPrompt = touchPrompt ? prompt + '. ' + touchPrompt : prompt;

  try {
    const res = await fetch('/api/image_gen/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        prompt: finalPrompt,
        cast_refs: castRefs,
        gen_model: document.getElementById('model').value,
        gen_aspect: document.getElementById('aspect').value,
      })
    });
    const data = await res.json();
    spinner.style.display = 'none';
    if (data.ok) {
      const img = document.createElement('img');
      img.src = '/api/image_gen/img/' + data.filename;
      img.style.maxWidth = '100%';
      img.style.borderRadius = '6px';
      resultArea.appendChild(img);
    } else {
      resultArea.innerHTML = '<div class="placeholder"><i class="fa fa-triangle-exclamation"></i>' + (data.error||'エラー') + '</div>';
    }
  } catch(e) {
    spinner.style.display = 'none';
    resultArea.innerHTML = '<div class="placeholder"><i class="fa fa-triangle-exclamation"></i>通信エラー</div>';
  }
  btn.disabled = false;
}

renderCastGrid();
renderTouchPresets();
</script>
</body>
</html>`);
});
