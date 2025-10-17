const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const META_FILE = path.join(UPLOAD_DIR, 'metadata.json');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function loadMeta() { try { return JSON.parse(fs.readFileSync(META_FILE, 'utf-8')); } catch { return { items: {} }; } }
function saveMeta(meta) { fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2)); }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const time = Date.now();
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, `${time}__${safe}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
// Good: simple static
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(js|css|html)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));


app.get('/api/videos', (req, res) => {
  const meta = loadMeta();
  const files = fs.readdirSync(UPLOAD_DIR).filter(f => f !== 'metadata.json')
    .filter(f => /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(f));
  const items = files.map(fname => {
    const stat = fs.statSync(path.join(UPLOAD_DIR, fname));
    const id = fname;
    const title = meta.items[id]?.title ?? fname.replace(/^\d+__/, '').replace(/\.[^/.]+$/, '');
    return { id, title, url: `/uploads/${encodeURIComponent(fname)}`, size: stat.size, uploadedAt: stat.birthtimeMs ||     stat.ctimeMs };

  });
  res.json({ items });
});

app.post('/api/upload', upload.array('files'), (req, res) => {
  const meta = loadMeta();
  for (const file of req.files) {
    const id = file.filename;
    const defaultTitle = file.originalname.replace(/\.[^/.]+$/, '');
    meta.items[id] = meta.items[id] || { title: defaultTitle };
  }
  saveMeta(meta);
  res.json({ ok: true, count: req.files.length });
});

app.patch('/api/videos/:id', (req, res) => {
  const { id } = req.params;
  const { title } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  const meta = loadMeta();
  if (!meta.items[id]) meta.items[id] = {};
  meta.items[id].title = title.trim();
  saveMeta(meta);
  res.json({ ok: true });
});

app.delete('/api/videos/:id', (req, res) => {
  const { id } = req.params;
  const filePath = path.join(UPLOAD_DIR, id);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(filePath);
  const meta = loadMeta();
  delete meta.items[id];
  saveMeta(meta);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Roniz uploader running on http://localhost:${PORT}`));
