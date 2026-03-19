import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.AGORA_PORT || 8810;
const AGORA_ROOT = path.resolve(__dirname, '..');

app.use(express.json());
import cookieParser from 'cookie-parser';
app.use(cookieParser());

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

// ── OpenAPI spec ──
app.get('/api/openapi.yaml', (_req, res) => {
  const yamlPath = path.join(__dirname, '../docs/openapi.yaml');
  res.setHeader('Content-Type', 'application/yaml');
  res.sendFile(yamlPath);
});

// ── Swagger UI ──
app.get('/api/index.html', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>agora API</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #0d1117; color: #c9d1d9; font-family: 'Inter', sans-serif; }

    /* ヘッダー */
    .swagger-ui .topbar { background: #0d1117; border-bottom: 1px solid #21262d; padding: 16px 0; }
    .swagger-ui .topbar-wrapper { display: flex; align-items: center; gap: 16px; }
    .swagger-ui .topbar-wrapper .link { font-family: 'Cormorant Garamond', serif; font-size: 1.5rem; color: #e6edf3 !important; text-decoration: none; letter-spacing: .1em; }
    .swagger-ui .topbar-wrapper .link::after { content: ' API'; font-size: 0.8em; color: #8b949e; }
    .swagger-ui .topbar-wrapper img { display: none; }

    /* 背景・テキスト */
    .swagger-ui { background: #0d1117; color: #c9d1d9; }
    .swagger-ui .wrapper { background: #0d1117; }
    .swagger-ui .info { margin: 40px 0 24px; }
    .swagger-ui .info .title { font-family: 'Cormorant Garamond', serif; color: #e6edf3; font-size: 2rem; letter-spacing: .05em; }
    .swagger-ui .info p, .swagger-ui .info li { color: #8b949e; }
    .swagger-ui .info a { color: #58a6ff; }

    /* スキーマ・ボックス */
    .swagger-ui .scheme-container { background: #161b22; border: 1px solid #21262d; box-shadow: none; padding: 16px 24px; }
    .swagger-ui .servers > label select { background: #161b22; color: #c9d1d9; border: 1px solid #30363d; border-radius: 4px; }
    .swagger-ui select { background: #161b22; color: #c9d1d9; border: 1px solid #30363d; }

    /* タグセクション */
    .swagger-ui .opblock-tag { color: #e6edf3; border-bottom: 1px solid #21262d; font-family: 'Inter', sans-serif; font-weight: 500; }
    .swagger-ui .opblock-tag:hover { background: #161b22; }

    /* エンドポイントブロック */
    .swagger-ui .opblock { background: #161b22; border: 1px solid #21262d; border-radius: 6px; margin-bottom: 8px; box-shadow: none; }
    .swagger-ui .opblock .opblock-summary { border-bottom: none; }
    .swagger-ui .opblock .opblock-summary-description { color: #8b949e; }
    .swagger-ui .opblock.opblock-get { border-left: 3px solid #388bfd; }
    .swagger-ui .opblock.opblock-post { border-left: 3px solid #3fb950; }
    .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #1f3a5f; color: #58a6ff; }
    .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #1a3a2a; color: #3fb950; }
    .swagger-ui .opblock-body { background: #0d1117; }
    .swagger-ui .opblock-description-wrapper p { color: #8b949e; }

    /* Authorizeボタン */
    .swagger-ui .btn.authorize { background: transparent; color: #58a6ff; border: 1px solid #30363d; }
    .swagger-ui .btn.authorize svg { fill: #58a6ff; }
    .swagger-ui .btn.authorize:hover { background: #1f3a5f; }

    /* テーブル・モデル */
    .swagger-ui table thead tr th { color: #8b949e; border-bottom: 1px solid #21262d; }
    .swagger-ui table tbody tr td { color: #c9d1d9; border-bottom: 1px solid #21262d; }
    .swagger-ui .model-box { background: #161b22; }
    .swagger-ui section.models { border: 1px solid #21262d; background: #161b22; }
    .swagger-ui section.models .model-container { background: #0d1117; }
    .swagger-ui .model { color: #c9d1d9; }

    /* Try it out */
    .swagger-ui .btn { border-radius: 4px; }
    .swagger-ui .btn.try-out__btn { background: transparent; color: #58a6ff; border: 1px solid #30363d; }
    .swagger-ui .btn.execute { background: #388bfd; color: #fff; border: none; }
    .swagger-ui .responses-inner { background: #0d1117; }
    .swagger-ui .response-col_status { color: #3fb950; }
    .swagger-ui textarea { background: #161b22; color: #c9d1d9; border: 1px solid #30363d; }
    .swagger-ui input[type=text], .swagger-ui input[type=password] { background: #161b22; color: #c9d1d9; border: 1px solid #30363d; }

    /* コードブロック */
    .swagger-ui .highlight-code { background: #161b22; }
    .swagger-ui .microlight { background: #161b22 !important; color: #c9d1d9 !important; }

    /* モーダル */
    .swagger-ui .dialog-ux .modal-ux { background: #161b22; border: 1px solid #30363d; box-shadow: 0 8px 32px rgba(0,0,0,.6); }
    .swagger-ui .dialog-ux .modal-ux-header { border-bottom: 1px solid #21262d; background: #161b22; }
    .swagger-ui .dialog-ux .modal-ux-header h3 { color: #e6edf3; }
    .swagger-ui .dialog-ux .modal-ux-content { background: #161b22; }
    .swagger-ui .dialog-ux .modal-ux-content h4 { color: #c9d1d9; }
    .swagger-ui .dialog-ux .modal-ux-content p { color: #8b949e; }
    .swagger-ui .auth-container { background: #161b22; }
    .swagger-ui .auth-container h4 { color: #e6edf3; }
    .swagger-ui .auth-container .wrapper { background: #0d1117; border: 1px solid #30363d; border-radius: 4px; padding: 16px; margin-bottom: 12px; }
    .swagger-ui .auth-container .wrapper p { color: #8b949e; margin: 6px 0; }
    .swagger-ui .auth-container input[type=text] { background: #0d1117; color: #c9d1d9; border: 1px solid #30363d; margin-top: 8px; padding: 8px 10px; width: 100%; }
    .swagger-ui .btn.modal-btn-auth { background: #388bfd; color: #fff; border: none; }
    .swagger-ui .btn.modal-btn-auth.authorize { background: #388bfd; }
    .swagger-ui .close-tag { color: #8b949e; }
    .swagger-ui .dialog-ux .modal-ux-content .close-tag:hover { color: #e6edf3; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/openapi.yaml',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
      tryItOutEnabled: true,
    });
  </script>
</body>
</html>`);
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
      <a href="/tools/git/" class="tool-card">
        <span class="tool-icon"><i class="fa-solid fa-code-branch"></i></span>
        <div class="tool-info">
          <div class="tname">git viewer</div>
          <div class="tdesc">bibliotheke / metroon コミット履歴</div>
        </div>
      </a>
      <a href="/tools/proposals/ui" class="tool-card">
        <span class="tool-icon"><i class="fa-solid fa-scroll"></i></span>
        <div class="tool-info">
          <div class="tname">proposals</div>
          <div class="tdesc">機能提案・ステータス一覧</div>
        </div>
      </a>
      <a href="/tools/services/" class="tool-card">
        <span class="tool-icon"><i class="fa-solid fa-server"></i></span>
        <div class="tool-info">
          <div class="tname">services</div>
          <div class="tdesc">サービス一覧・稼働状況</div>
        </div>
      </a>
      <a href="/tools/auth/" class="tool-card">
        <span class="tool-icon"><i class="fa-solid fa-shield-halved"></i></span>
        <div class="tool-info">
          <div class="tname">auth</div>
          <div class="tdesc">公開鍵署名による市民認証</div>
        </div>
      </a>
    </div>

    <div class="section-label">API</div>
    <div class="tools">
      <a href="/api/index.html" class="tool-card">
        <span class="tool-icon"><i class="fa-solid fa-book-open"></i></span>
        <div class="tool-info">
          <div class="tname">API仕様書</div>
          <div class="tdesc">Swagger UI — OpenAPI 3.0</div>
        </div>
      </a>
    </div>
    <div class="footer">
      <em>bon-soleil Holdings — Rooted Cosmopolitanism</em><br>
      根を張り、壁を溶かす。<br>
      <a href="https://github.com/goodsun/agora" target="_blank" style="color:#445566;text-decoration:none;">
        <i class="fab fa-github"></i> goodsun/agora
      </a>
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

import { gitRouter, gitUIRouter } from './plugins/tools_git';
app.use('/api/git', gitRouter);
app.use('/tools/git', gitUIRouter);

import { proposalsRouter } from './plugins/tools_proposals';
app.use('/api/proposals', proposalsRouter);
app.use('/tools/proposals', proposalsRouter);

import { router as servicesRouter } from './plugins/tools_services';
app.use(servicesRouter);

import { router as authRouter } from './plugins/auth';
app.use(authRouter);

// ── file_manager API + UI ──
import { fileManagerRouter, fileManagerUIRouter } from './plugins/tools_file_manager';
app.use('/api/file_manager', fileManagerRouter);
app.use('/tools/file_manager', fileManagerUIRouter);

app.listen(PORT, () => {
  console.log(`agora listening on port ${PORT}`);
  console.log(`→ http://localhost:${PORT}/`);
});
