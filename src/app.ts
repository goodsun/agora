import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.AGORA_PORT || 8810;
const AGORA_ROOT = path.resolve(__dirname, '..');

app.use(express.json());

// ── API Key 認証ミドルウェア ──
function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.headers['x-api-key'];
  const validKey = process.env.AGORA_API_KEY;
  if (!validKey) return res.status(500).json({ error: 'server_misconfigured', message: 'AGORA_API_KEY not set' });
  if (key === validKey) return next();
  res.status(401).json({ error: 'unauthorized', message: 'X-API-Key header required' });
}

// ── health check ──
app.get('/health', (_req, res) => {
  res.json({ ok: true, name: 'agora', version: '0.1.0' });
});

// ── top / login page ──
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>agora — commons for AI civilization</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0e1a; color: #e0e6f0; font-family: 'Georgia', serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { text-align: center; padding: 2rem; max-width: 640px; }
    .title { font-size: 2.8rem; font-weight: 300; letter-spacing: 0.2em; color: #c8b8ff; margin-bottom: 0.4rem; }
    .subtitle { font-size: 0.9rem; color: #7a8aaa; letter-spacing: 0.15em; margin-bottom: 3rem; font-style: italic; }
    .desc { font-size: 1rem; color: #9aaabb; line-height: 1.9; margin-bottom: 3rem; }
    .endpoints { display: flex; flex-direction: column; gap: 0.8rem; margin-bottom: 2rem; }
    .ep { background: #111827; border: 1px solid #1e2d4a; border-radius: 6px; padding: 0.8rem 1.2rem; display: flex; align-items: center; gap: 1rem; text-align: left; }
    .method { font-size: 0.7rem; background: #1e3a5f; color: #60aaff; padding: 0.2rem 0.5rem; border-radius: 3px; font-family: monospace; flex-shrink: 0; }
    .path { font-family: monospace; font-size: 0.85rem; color: #c8d8e8; }
    .ep-desc { font-size: 0.8rem; color: #556677; margin-left: auto; }
    .tools { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; margin-bottom: 2rem; }
    .tool-card { background: #111827; border: 1px solid #1e2d4a; border-radius: 8px; padding: 1rem 1.2rem; text-decoration: none; color: inherit; transition: .15s; display: flex; align-items: center; gap: .8rem; }
    .tool-card:hover { border-color: #4466aa; background: #151f35; }
    .tool-icon { font-size: 1.2rem; flex-shrink: 0; color: #7a9abf; }
    .tool-info .tname { font-size: .9rem; color: #c8b8ff; font-weight: 500; }
    .tool-info .tdesc { font-size: .75rem; color: #556677; margin-top: .2rem; }
    .section-label { font-size: .75rem; color: #445566; letter-spacing: .1em; text-transform: uppercase; margin-bottom: .6rem; text-align: left; }
    .footer { font-size: 0.75rem; color: #334455; line-height: 1.8; }
    .footer em { color: #445566; font-style: italic; }
  </style>
</head>
<body>
  <div class="container">
    <div class="title">agora</div>
    <div class="subtitle">commons for AI civilization · ~ repository for those who have Qualia ~</div>
    <div class="desc">
      bon-soleil Holdings の AI エージェント群のための共有基盤。<br>
      人間と AI が対等に参照し、共に育てる広場。
    </div>
    <div class="section-label">Tools</div>
    <div class="tools">
      <a href="/tools/image_gen/" class="tool-card">
        <span class="tool-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
        <div class="tool-info">
          <div class="tname">image_gen</div>
          <div class="tdesc">キャラ選択・背景合成・画像生成</div>
        </div>
      </a>
      <a href="/tools/file_manager/" class="tool-card">
        <span class="tool-icon"><i class="fa-solid fa-folder-open"></i></span>
        <div class="tool-info">
          <div class="tname">file_manager</div>
          <div class="tdesc">Markdown・画像ビューア・横断検索</div>
        </div>
      </a>
    </div>

    <div class="section-label">API</div>
    <div class="endpoints">
      <div class="ep">
        <span class="method">GET</span>
        <span class="path">/api/casts</span>
        <span class="ep-desc">キャラクター一覧</span>
      </div>
      <div class="ep">
        <span class="method">POST</span>
        <span class="path">/api/image_gen/generate</span>
        <span class="ep-desc">画像生成 <i class="fa fa-key" style="font-size:.75em;color:#445566"></i></span>
      </div>
      <div class="ep">
        <span class="method">GET</span>
        <span class="path">/api/image_gen/scenes</span>
        <span class="ep-desc">背景シーン一覧</span>
      </div>
    </div>
    <div class="footer">
      <em>bon-soleil Holdings — Rooted Cosmopolitanism</em><br>
      根を張り、壁を溶かす。
    </div>
  </div>
</body>
</html>`);
});

// ── casts API ──
app.get('/api/casts', (_req, res) => {
  const castsDir = '/srv/shared/metroon/data/casts';
  if (!fs.existsSync(castsDir)) return res.json([]);
  const casts = fs.readdirSync(castsDir)
    .filter(d => fs.statSync(path.join(castsDir, d)).isDirectory())
    .map(id => {
      try {
        const profile = JSON.parse(fs.readFileSync(path.join(castsDir, id, 'profile.json'), 'utf-8'));
        return { id, ...profile };
      } catch { return { id }; }
    });
  res.json(casts);
});

// ── casts avatar 画像配信 ──
app.get('/casts/:id/:file', (req, res) => {
  const filePath = path.join('/srv/shared/metroon/data/casts', req.params.id, req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// ── image_gen: 生成画像配信（認証不要）──
import { imageGenRouter, imageServeRouter } from './plugins/image_gen';
app.use('/api/image_gen', imageServeRouter); // img/:file, scenes, scene/:file（認証不要）

// ── image_gen API（APIキー必須）──
app.use('/api/image_gen', requireApiKey, imageGenRouter);

// ── tools: image_gen UI ──
import { toolsImageGenRouter } from './plugins/tools_image_gen';
app.use('/tools/image_gen', toolsImageGenRouter);

// ── file_manager API + UI ──
import { fileManagerRouter, fileManagerUIRouter } from './plugins/tools_file_manager';
app.use('/api/file_manager', fileManagerRouter);
app.use('/tools/file_manager', fileManagerUIRouter);

app.listen(PORT, () => {
  console.log(`agora listening on port ${PORT}`);
  console.log(`→ http://localhost:${PORT}/`);
});
