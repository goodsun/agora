import { Router } from 'express';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';

export const imageGenRouter = Router();

const AGORA_ROOT = path.resolve(__dirname, '../../..');
const CASTS_DIR = path.join(AGORA_ROOT, 'casts');
const GEN_SCRIPT = path.join(__dirname, 'gen.js');
const OUT_DIR = process.env.AGORA_GEN_OUT || '/tmp/agora_gen';

// 出力ディレクトリを確保
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

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
  const { prompt, cast_refs, gen_model, gen_aspect } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  const apiKey = getGeminiKey();
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  // cast_refs → refs配列を組み立て
  let refsArr: Array<{path: string, label: string}> = [];
  if (cast_refs && Array.isArray(cast_refs)) {
    for (const cr of cast_refs) {
      if (!cr.id) continue;
      try {
        const profile = JSON.parse(fs.readFileSync(path.join(CASTS_DIR, cr.id, 'profile.json'), 'utf-8'));
        const styleData = profile.styles?.[cr.style] || profile.styles?.[profile.default_style] || {};
        const imgFile = styleData.image || '';
        if (imgFile) {
          const candidate = path.join(CASTS_DIR, cr.id, imgFile);
          if (fs.existsSync(candidate)) refsArr.push({ path: candidate, label: cr.label || cr.id });
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

// GET /agora/api/image_gen/img/:filename — 生成画像配信
imageGenRouter.get('/img/:filename', (req, res) => {
  const filePath = path.join(OUT_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});
