import express, { Router } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import multer from 'multer';

export const fileManagerRouter = Router();  // /api/file_manager/
export const fileManagerUIRouter = Router(); // /tools/file_manager/

const SEARCH_ROOTS: string[] = (process.env.FILE_MANAGER_ROOTS || '/srv/agora,/srv/shared')
  .split(',').map(s => s.trim()).filter(Boolean);

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);
const MD_EXTS = new Set(['.md']);
const JSON_EXTS = new Set(['.json']);
const ALLOWED_EXTS = new Set([...IMAGE_EXTS, ...MD_EXTS, ...JSON_EXTS]);

function isSafePath(p: string): boolean {
  const real = fs.realpathSync.native(p).replace(/\\/g, '/');
  return SEARCH_ROOTS.some(r => {
    try { return real.startsWith(fs.realpathSync.native(r).replace(/\\/g, '/')); } catch { return false; }
  });
}

// UI: GET /tools/file_manager/
fileManagerUIRouter.use(express_static_handler());
function express_static_handler() {
  const staticDir = path.join(__dirname, 'static');
  return (_req: any, res: any) => res.sendFile(path.join(staticDir, 'index.html'));
}

// API: GET /api/file_manager/files
fileManagerRouter.get('/files', (_req, res) => {
  const results: any[] = [];
  for (const root of SEARCH_ROOTS) {
    if (!fs.existsSync(root)) continue;
    walkDir(root, results);
  }
  results.sort((a, b) => a.path.localeCompare(b.path));
  res.json(results);
});

function walkDir(dir: string, results: any[]) {
  let entries: string[];
  try { entries = fs.readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const full = path.join(dir, entry);
    let stat: fs.Stats;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      walkDir(full, results);
    } else {
      const ext = path.extname(entry).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) continue;
      const mime = IMAGE_EXTS.has(ext) ? `image/${ext.slice(1)}` : 'text/plain';
      const type = IMAGE_EXTS.has(ext) ? 'image' : JSON_EXTS.has(ext) ? 'json' : 'md';
      results.push({
        path: full,
        name: entry,
        type,
        dir: dir,
        mtime: stat.mtimeMs / 1000,
        ctime: stat.ctimeMs / 1000,
        size: stat.size,
        mime,
      });
    }
  }
}

// API: GET /api/file_manager/file
fileManagerRouter.get('/file', (req, res) => {
  const p = String(req.query.path || '');
  if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) return res.status(404).end();
  try { if (!isSafePath(p)) return res.status(403).end(); } catch { return res.status(403).end(); }
  const ext = path.extname(p).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) return res.status(403).end();
  if (IMAGE_EXTS.has(ext)) {
    const mime = ext === '.svg' ? 'image/svg+xml' : `image/${ext === '.jpg' ? 'jpeg' : ext.slice(1)}`;
    return res.sendFile(p, { headers: { 'Content-Type': mime } });
  }
  const text = fs.readFileSync(p, 'utf-8');
  res.type('text/plain; charset=utf-8').send(text);
});

// API: PUT /api/file_manager/file — ファイル上書き保存（md/json のみ）
fileManagerRouter.put('/file', express.text({ type: '*/*', limit: '10mb' }), (req, res) => {
  const p = String(req.query.path || '');
  if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) return res.status(404).end();
  try { if (!isSafePath(p)) return res.status(403).end(); } catch { return res.status(403).end(); }
  const ext = path.extname(p).toLowerCase();
  if (![...MD_EXTS, ...JSON_EXTS].includes(ext)) return res.status(403).json({ error: 'not editable' });
  try {
    fs.writeFileSync(p, req.body, 'utf-8');
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API: PATCH /api/file_manager/file — リネーム
fileManagerRouter.patch('/file', (req, res) => {
  const p = String(req.query.path || '');
  const newname = String(req.query.newname || '').replace(/[/\\]/g, '');
  if (!p || !newname) return res.status(400).json({ error: 'path and newname required' });
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return res.status(404).end();
  try { if (!isSafePath(p)) return res.status(403).end(); } catch { return res.status(403).end(); }
  const newPath = path.join(path.dirname(p), newname);
  const ext = path.extname(newname).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) return res.status(403).json({ error: 'extension not allowed' });
  if (fs.existsSync(newPath)) return res.status(409).json({ error: 'already exists' });
  fs.renameSync(p, newPath);
  res.json({ ok: true, path: newPath });
});

// API: POST /api/file_manager/upload — アップロード
const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = String(req.query.dir || '');
      if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return cb(new Error('invalid dir'), '');
      try {
        const real = fs.realpathSync.native(dir);
        const ok = SEARCH_ROOTS.some(r => { try { return real.startsWith(fs.realpathSync.native(r)); } catch { return false; } });
        if (!ok) return cb(new Error('forbidden'), '');
      } catch { return cb(new Error('forbidden'), ''); }
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, file.originalname),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ALLOWED_EXTS.has(ext));
  }
});

fileManagerRouter.post('/upload', uploadMiddleware.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file or not allowed type' });
  const ext = path.extname(req.file.filename).toLowerCase();
  const type = IMAGE_EXTS.has(ext) ? 'image' : JSON_EXTS.has(ext) ? 'json' : 'md';
  res.json({ ok: true, path: req.file.path, name: req.file.filename, type });
});

// API: DELETE /api/file_manager/file
fileManagerRouter.delete('/file', (req, res) => {
  const p = String(req.query.path || '');
  if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) return res.status(404).end();
  try { if (!isSafePath(p)) return res.status(403).end(); } catch { return res.status(403).end(); }
  const ext = path.extname(p).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) return res.status(403).end();
  fs.unlinkSync(p);
  res.json({ ok: true, deleted: p });
});

// API: POST /api/file_manager/compress
fileManagerRouter.post('/compress', async (req, res) => {
  const p = String(req.query.path || '');
  if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) return res.status(404).end();
  try { if (!isSafePath(p)) return res.status(403).end(); } catch { return res.status(403).end(); }
  const ext = path.extname(p).toLowerCase();
  if (!IMAGE_EXTS.has(ext) || ext === '.svg' || ext === '.gif') return res.status(400).json({ error: 'not compressible' });
  const before = fs.statSync(p).size;
  try {
    let buf: Buffer;
    let newPath: string;
    if (ext === '.png') {
      // PNG: 透過情報を保持したままpalette圧縮
      buf = await sharp(p).png({ compressionLevel: 9, palette: true, quality: 80 }).toBuffer();
      newPath = p; // 同名上書き
    } else {
      // JPG/WEBP: JPEG品質75で圧縮
      buf = await sharp(p).jpeg({ quality: 75, progressive: true }).toBuffer();
      newPath = p.replace(/\.[^.]+$/, '.jpg');
    }
    fs.writeFileSync(newPath, buf);
    if (newPath !== p) fs.unlinkSync(p);
    const after = fs.statSync(newPath).size;
    const saved = Math.round((1 - after / before) * 100);
    res.json({ ok: true, before, after, saved, path: newPath });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
