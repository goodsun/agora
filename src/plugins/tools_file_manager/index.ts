import express, { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import multer from 'multer';
import { verifySessionToken } from '../auth';

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
fileManagerRouter.get('/files', (req: Request, res: Response) => {
  // 認証状態を確認（あれば private/ も含める）
  const cookieToken = (req as any).cookies?.agora_session;
  const bearerToken = req.headers.authorization?.replace('Bearer ', '');
  const token = cookieToken || bearerToken;
  const session = token ? verifySessionToken(token) : null;
  const allowPrivate = !!session;

  const results: any[] = [];
  for (const root of SEARCH_ROOTS) {
    if (!fs.existsSync(root)) continue;
    walkDir(root, results, allowPrivate);
  }
  results.sort((a, b) => a.path.localeCompare(b.path));
  res.json(results);
});

function walkDir(dir: string, results: any[], allowPrivate = false) {
  let entries: string[];
  try { entries = fs.readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const full = path.join(dir, entry);
    // private/ ディレクトリは認証済みの場合のみ走査
    if (full.includes('/private/') && !allowPrivate) continue;
    let stat: fs.Stats;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      walkDir(full, results, allowPrivate);
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

// API: GET /api/file_manager/search — ファイル名・パスでキーワード検索（エージェント向け）
fileManagerRouter.get('/search', (req: Request, res: Response) => {
  const q = String(req.query.q || '').toLowerCase();
  const root = String(req.query.root || '').toLowerCase();
  const cookieToken = (req as any).cookies?.agora_session;
  const bearerToken = req.headers.authorization?.replace('Bearer ', '');
  const token = cookieToken || bearerToken;
  const session = token ? verifySessionToken(token) : null;
  const allowPrivate = !!session;

  const results: any[] = [];
  for (const r of SEARCH_ROOTS) {
    if (root && !r.toLowerCase().includes(root)) continue;
    if (!fs.existsSync(r)) continue;
    walkDir(r, results, allowPrivate);
  }
  const filtered = q
    ? results.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
    : results;
  filtered.sort((a, b) => a.path.localeCompare(b.path));
  res.json(filtered);
});

// API: GET /api/file_manager/read — ファイル内容取得（テキスト・md・json のみ、エージェント向け）
fileManagerRouter.get('/read', (req: Request, res: Response) => {
  const p = String(req.query.path || '');
  if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) return res.status(404).json({ error: 'not found' });
  try { if (!isSafePath(p)) return res.status(403).json({ error: 'forbidden' }); } catch { return res.status(403).json({ error: 'forbidden' }); }

  // private/ ディレクトリへのアクセスは認証必須
  const isPrivate = p.includes('/private/');
  if (isPrivate) {
    const cookieToken = (req as any).cookies?.agora_session;
    const bearerToken = req.headers.authorization?.replace('Bearer ', '');
    const token = cookieToken || bearerToken;
    if (!token) return res.status(401).json({ error: 'authentication required', hint: 'Visit /tools/auth/ to sign in' });
    const session = verifySessionToken(token);
    if (!session) return res.status(401).json({ error: 'invalid or expired token' });

    // private/<id>/ は対応するエージェントまたはadminのみ
    const privateMatch = p.match(/\/private\/([^/]+)\//);
    if (privateMatch && privateMatch[1] !== 'shared') {
      const targetId = privateMatch[1];
      const isAdmin = session.roles.includes('admin');
      const isOwner = session.agent_id === targetId;
      const hasAccess = session.private_access?.includes('*') || session.private_access?.includes(targetId);
      if (!isAdmin && !isOwner && !hasAccess) {
        return res.status(403).json({ error: `access denied to private/${targetId}/`, agent: session.agent_id });
      }
    }
  }

  const ext = path.extname(p).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return res.status(400).json({ error: 'use /file for images' });
  if (!ALLOWED_EXTS.has(ext)) return res.status(403).json({ error: 'extension not allowed' });
  const content = fs.readFileSync(p, 'utf-8');
  res.json({ path: p, content, private: isPrivate });
});

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
