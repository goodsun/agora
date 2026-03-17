import { Router } from 'express';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import multer from 'multer';

export const imageGenRouter = Router();
export const imageServeRouter = Router();

const AGORA_ROOT = path.resolve(__dirname, '../../..');
const CASTS_DIR = '/srv/shared/metroon/data/casts';
const GEN_SCRIPT = path.join(__dirname, 'gen.js');
const OUT_DIR = process.env.AGORA_GEN_OUT || path.join(AGORA_ROOT, 'generated');
const KEEP_HOURS = parseInt(process.env.AGORA_GEN_KEEP_HOURS || "336"); // デフォルト2週間
const SCENES_DIR = '/srv/shared/metroon/data/uploads/scenes';
if (!fs.existsSync(SCENES_DIR)) fs.mkdirSync(SCENES_DIR, { recursive: true });

// 出力ディレクトリを確保
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// 定期クリーンアップ（1時間おき）
function cleanupOldFiles() {
  const cutoff = Date.now() - KEEP_HOURS * 60 * 60 * 1000;
  try {
    const files = fs.readdirSync(OUT_DIR);
    let deleted = 0;
    for (const f of files) {
      const fp = path.join(OUT_DIR, f);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs < cutoff) { fs.unlinkSync(fp); deleted++; }
    }
    if (deleted > 0) console.log(`[image_gen] cleanup: ${deleted} files deleted (older than ${KEEP_HOURS}h)`);
  } catch {}
}
cleanupOldFiles();
setInterval(cleanupOldFiles, 60 * 60 * 1000);

// 背景アップロード用multer（data/uploads/scenes/ に永続保存）
const bgUpload = multer({
  storage: multer.diskStorage({
    destination: SCENES_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const base = path.basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
      cb(null, `${base}_${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
    cb(null, ok);
  }
});

// GET /api/image_gen/presets — タッチ・モデルプリセット一覧（認証不要）
imageServeRouter.get('/presets', (_req, res) => {
  const PRESETS_DIR = '/srv/shared/metroon/data/presets';
  const result: Record<string, unknown> = {};
  const files = ['touch_presets.json', 'model_presets.json'];
  for (const f of files) {
    const fp = path.join(PRESETS_DIR, f);
    if (fs.existsSync(fp)) {
      try { result[f.replace('.json', '')] = JSON.parse(fs.readFileSync(fp, 'utf-8')); }
      catch { result[f.replace('.json', '')] = null; }
    }
  }
  res.json(result);
});

// GET /api/image_gen/scenes — シーン一覧（認証不要）
imageServeRouter.get('/scenes', (_req, res) => {
  const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
  const files = fs.existsSync(SCENES_DIR)
    ? fs.readdirSync(SCENES_DIR).filter(f => IMG_EXTS.includes(path.extname(f).toLowerCase()))
    : [];
  res.json(files.map(f => ({ filename: f, url: `/api/image_gen/scene/${f}` })));
});

// GET /api/image_gen/scene/:file — シーン画像配信（認証不要）
imageServeRouter.get('/scene/:file', (req, res) => {
  const fp = path.join(SCENES_DIR, path.basename(req.params.file));
  if (!fs.existsSync(fp)) return res.status(404).end();
  res.sendFile(fp);
});

// POST /api/image_gen/upload_bg — 背景画像アップロード（APIキー必須）
imageGenRouter.post('/upload_bg', bgUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  res.json({ ok: true, filename: req.file.filename, url: `/api/image_gen/scene/${req.file.filename}` });
});

function getGeminiKey(): string {
  // .env or 環境変数から取得
  const envFile = path.join(AGORA_ROOT, '.env');
  if (fs.existsSync(envFile)) {
    const line = fs.readFileSync(envFile, 'utf-8').split('\n').find(l => l.startsWith('GEMINI_API_KEY='));
    if (line) return line.split('=')[1].trim();
  }
  return process.env.GEMINI_API_KEY || '';
}

// POST /agora/api/image_gen/generate
// body: { prompt, cast_refs?, gen_model?, gen_aspect? }
// cast_refs: [{id, style, label}]
imageGenRouter.post('/generate', (req, res) => {
  const { prompt, cast_refs, gen_model, gen_aspect, bg_filename: bg_fn } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  const apiKey = getGeminiKey();
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  // cast_refs → refs配列を組み立て
  let refsArr: Array<{path: string, label: string, name?: string}> = [];

  // 背景画像をrefの先頭に追加
  const bg_filename = bg_fn ? String(bg_fn) : '';
  if (bg_filename) {
    const bgPath = path.join(SCENES_DIR, path.basename(bg_filename));
    if (fs.existsSync(bgPath)) refsArr.push({ path: bgPath, label: 'BG' });
  }

  if (cast_refs && Array.isArray(cast_refs)) {
    for (const cr of cast_refs) {
      if (!cr.id) continue;
      try {
        const profile = JSON.parse(fs.readFileSync(path.join(CASTS_DIR, cr.id, 'profile.json'), 'utf-8'));
        const styleData = profile.styles?.[cr.style] || profile.styles?.[profile.default_style] || {};
        const imgFile = styleData.image || '';
        if (imgFile) {
          const candidate = path.join(CASTS_DIR, cr.id, imgFile);
          if (fs.existsSync(candidate)) refsArr.push({ path: candidate, label: cr.label || cr.id, name: profile.name || cr.id });
        }
      } catch {}
    }
  }

  const model = gen_model || 'gemini-2.5-flash-image';
  const aspect = gen_aspect || '1:1';
  const filename = `gen_${Date.now()}.png`;
  const outPath = path.join(OUT_DIR, filename);

  const args = [
    GEN_SCRIPT, prompt, outPath, apiKey,
    JSON.stringify(refsArr), model, aspect
  ];

  execFile(process.execPath, args, { timeout: 120000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('[image_gen] error:', stderr);
      return res.status(500).json({ error: 'generation failed', detail: stderr });
    }
    res.json({ ok: true, filename, path: outPath });
  });
});

// GET /api/image_gen/img/:filename — 生成画像配信（認証不要）
imageServeRouter.get('/img/:filename', (req, res) => {
  const filePath = path.join(OUT_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});
