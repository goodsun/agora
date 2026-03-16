import express from 'express';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.AGORA_PORT || 8810;
const AGORA_ROOT = path.resolve(__dirname, '..');

app.use(express.json());

// ── health check ──
app.get('/agora/health', (_req, res) => {
  res.json({ ok: true, name: 'agora', version: '0.1.0' });
});

// ── casts API ──
app.get('/agora/api/casts', (_req, res) => {
  const castsDir = path.join(AGORA_ROOT, 'casts');
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
app.get('/agora/casts/:id/:file', (req, res) => {
  const filePath = path.join(AGORA_ROOT, 'casts', req.params.id, req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// ── image_gen API ──
import { imageGenRouter } from './plugins/image_gen';
app.use('/agora/api/image_gen', imageGenRouter);

app.listen(PORT, () => {
  console.log(`agora listening on port ${PORT}`);
  console.log(`→ http://localhost:${PORT}/agora/`);
});
