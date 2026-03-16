import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

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
    const buf = await sharp(p).jpeg({ quality: 75, progressive: true }).toBuffer();
    const newPath = p.replace(/\.[^.]+$/, '.jpg');
    fs.writeFileSync(newPath, buf);
    if (newPath !== p) fs.unlinkSync(p);
    const after = fs.statSync(newPath).size;
    res.json({ ok: true, before, after, path: newPath });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
