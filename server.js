const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const META_FILE = path.join(UPLOAD_DIR, 'metadata.json');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function loadMeta() { try { return JSON.parse(fs.readFileSync(META_FILE, 'utf-8')); } catch { return { items: {} }; } }
function saveMeta(meta) { fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2)); }
function thumbJpgFromVideo(filename) {
  // store next to the video, e.g. "123__foo.mp4" -> "123__foo.mp4.jpg"
  return filename + '.jpg';
}
function slateSvgFromVideo(filename) {
  return filename + '.svg';
}

// ffmpeg: grab a frame ~3s in, scale to 640w, good quality
function generateThumbFFmpeg(inFile, outFile) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-ss', '00:00:03',
      '-i', inFile,
      '-frames:v', '1',
      '-vf', 'scale=640:-1:force_original_aspect_ratio=decrease',
      '-q:v', '3',
      outFile
    ];
    const p = spawn('ffmpeg', args, { stdio: 'ignore' });
    p.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg exited ' + code)));
  });
}

// Clean branded slate thumbnail (SVG) as a fallback (no extra packages)
function writeSlateSVG(title, outFileFullPath) {
  const safeTitle = (title || 'Roniz Lesson').replace(/[<>]/g, '');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="640" height="360" viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#1f2937"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#g)"/>
  <text x="40" y="110" fill="#9CA3AF" font-family="Segoe UI, Roboto, Arial" font-size="20">Roniz</text>
  <text x="40" y="180" fill="#FFFFFF" font-family="Segoe UI, Roboto, Arial" font-size="34" font-weight="700">${safeTitle}</text>
  <rect x="40" y="230" width="150" height="6" rx="3" fill="#374151"/>
  <rect x="40" y="244" width="220" height="6" rx="3" fill="#374151"/>
</svg>`;
  require('fs').writeFileSync(outFileFullPath, svg, 'utf-8');
}


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

// ↓↓↓ ADD THIS BLOCK HERE ↓↓↓
const jobs = [];
for (const file of req.files) {
  const id = file.filename;
  const defaultTitle = file.originalname.replace(/\.[^/.]+$/, '');
  meta.items[id] = meta.items[id] || { title: defaultTitle };

  const inFull = path.join(UPLOAD_DIR, id);
  const jpgFull = path.join(UPLOAD_DIR, thumbJpgFromVideo(id));
  const svgFull = path.join(UPLOAD_DIR, slateSvgFromVideo(id));

  // Try ffmpeg JPG first; if it fails, write SVG slate fallback
  const job = generateThumbFFmpeg(inFull, jpgFull).catch(() => {
    writeSlateSVG(defaultTitle, svgFull);
  });
  jobs.push(job);
}
await Promise.all(jobs);
// ↑↑↑ END OF ADDED BLOCK ↑↑↑

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
  const jpgFull = path.join(UPLOAD_DIR, thumbJpgFromVideo(id));
  if (fs.existsSync(jpgFull)) fs.unlinkSync(jpgFull);
  const svgFull = path.join(UPLOAD_DIR, slateSvgFromVideo(id));
  if (fs.existsSync(svgFull)) fs.unlinkSync(svgFull);

  const meta = loadMeta();
  delete meta.items[id];
  saveMeta(meta);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Roniz uploader running on http://localhost:${PORT}`));
