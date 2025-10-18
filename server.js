const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const META_FILE  = path.join(UPLOAD_DIR, 'metadata.json');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function loadMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf-8')); }
  catch { return { items: {} }; }
}
function saveMeta(meta) { fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2)); }

function fileExistsNonZero(p) {
  try {
    const s = fs.statSync(p);
    return s.isFile() && s.size > 0;
  } catch { return false; }
}

/* ---------- Thumbnail helpers ---------- */
function thumbJpgFromVideo(filename) { return filename + '.jpg'; }          // (kept for future use)
function slateSvgFromVideo(filename) { return filename + '.svg'; }
function coverJpgFromVideo(filename) { return filename + '.cover.jpg'; }

function writeSlateSVG(title, outFileFullPath, theme = 'midnight') {
  const safeTitle = (title || 'Roniz Lesson').replace(/[<>]/g, '');
  const themes = {
    midnight: {
      bgA: '#0d1117', bgB: '#1f2937',
      accent: '#374151', titleFill: '#ffffff', brandFill: '#9CA3AF'
    },
    chalk: {
      // chalkboard vibe
      bgA: '#193a2a', bgB: '#132e21',
      accent: '#2a4b39', titleFill: '#e8f5e9', brandFill: '#b7d7c3'
    },
    paper: {
      // clean note paper
      bgA: '#faf8f3', bgB: '#f1ede3',
      accent: '#d9d3c3', titleFill: '#222222', brandFill: '#6b7280'
    }
  };
  const t = themes[theme] || themes.midnight;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="640" height="360" viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${t.bgA}"/>
      <stop offset="100%" stop-color="${t.bgB}"/>
    </linearGradient>

    <!-- subtle grid for math vibe -->
    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M20 0H0V20" fill="none" stroke="${t.accent}" stroke-opacity="0.25" stroke-width="1"/>
    </pattern>
    <filter id="noise" x="0" y="0" width="1" height="1">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.04"/>
      </feComponentTransfer>
    </filter>

    <style><![CDATA[
      @media (prefers-color-scheme: light) {
        .title { letter-spacing: 0.5px; }
      }
      .math { opacity: .25; font: 24px 'Segoe UI', Roboto, Arial, sans-serif; }
      .brand { font: 600 18px 'Segoe UI', Roboto, Arial, sans-serif; fill: ${t.brandFill}; }
      .title { font: 800 38px 'Segoe UI', Roboto, Arial, sans-serif; fill: ${t.titleFill}; }
    ]]></style>
  </defs>

  <rect width="640" height="360" fill="url(#bg)"/>
  <rect width="640" height="360" fill="url(#grid)"/>
  <rect width="640" height="360" filter="url(#noise)"/>

  <!-- Brand -->
  <text x="32" y="72" class="brand">Roniz</text>

  <!-- Title -->
  <foreignObject x="32" y="118" width="576" height="160">
    <div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;height:100%;">
      <div class="title" style="line-height:1.15;word-wrap:break-word;">
        ${safeTitle}
      </div>
    </div>
  </foreignObject>

  <!-- math glyphs -->
  <text x="40" y="280" class="math" fill="${t.brandFill}">π  •  Σ  •  √  •  ∫  •  ≈  •  ∞</text>
  <rect x="40" y="298" width="180" height="6" rx="3" fill="${t.accent}" opacity=".8"/>
  <rect x="40" y="312" width="240" height="6" rx="3" fill="${t.accent}" opacity=".6"/>
</svg>`;
  fs.writeFileSync(outFileFullPath, svg, 'utf-8');
}

/* ---------- MULTER SETUP (fix: define storage before use) ---------- */
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const time = Date.now();
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, `${time}__${safe}`);
  }
});

const upload = multer({
  storage: videoStorage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB
});

// cover image uploader
const coverUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, coverJpgFromVideo(req.params.id))
  }),
  fileFilter: (req, file, cb) => cb(null, /image\/(jpeg|png|webp)/i.test(file.mimetype)),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

app.use(cors());
app.use(express.json());

// static files
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(js|css|html)$/.test(filePath)) res.setHeader('Cache-Control', 'no-store');
  }
}));

/* ---------- API ---------- */

// List videos (+ best-available thumbnail)
app.get('/api/videos', (req, res) => {
  const meta  = loadMeta();
  const files = fs.readdirSync(UPLOAD_DIR)
    .filter(f => f !== 'metadata.json')
    .filter(f => /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(f));

  const items = files.map(fname => {
    const stat   = fs.statSync(path.join(UPLOAD_DIR, fname));
    const id     = fname;
    const title  = meta.items[id]?.title ?? fname.replace(/^\d+__/, '').replace(/\.[^/.]+$/, '');
    const url    = `/uploads/${encodeURIComponent(fname)}`;

    // Priority: custom cover → jpg (if present) → slate svg
    const coverLocal = path.join(UPLOAD_DIR, coverJpgFromVideo(fname));
    const jpgLocal   = path.join(UPLOAD_DIR, thumbJpgFromVideo(fname));
    const svgLocal   = path.join(UPLOAD_DIR, slateSvgFromVideo(fname));

    let thumb = null;
    if (fileExistsNonZero(coverLocal)) thumb = `/uploads/${encodeURIComponent(path.basename(coverLocal))}`;
    else if (fileExistsNonZero(jpgLocal)) thumb = `/uploads/${encodeURIComponent(path.basename(jpgLocal))}`;
    else if (fileExistsNonZero(svgLocal)) thumb = `/uploads/${encodeURIComponent(path.basename(svgLocal))}`;

    return { id, title, url, thumb, size: stat.size, uploadedAt: stat.birthtimeMs || stat.ctimeMs };
  });

  res.json({ items });
});

// Upload new videos (always create a slate SVG immediately)
app.post('/api/upload', upload.array('files'), (req, res) => {
  const files = req.files || [];
  const meta  = loadMeta();

  for (const file of files) {
    const id = file.filename;
    const defaultTitle = file.originalname.replace(/\.[^/.]+$/, '');
    meta.items[id] = meta.items[id] || { title: defaultTitle };

    const svgFull = path.join(UPLOAD_DIR, slateSvgFromVideo(id));
    try { writeSlateSVG(defaultTitle, svgFull); } catch {}
  }

  saveMeta(meta);
  res.json({ ok: true, count: files.length });
});

// Rename (title)
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

// Delete video + related thumbnails
app.delete('/api/videos/:id', (req, res) => {
  const { id } = req.params;
  const videoPath = path.join(UPLOAD_DIR, id);
  if (!fs.existsSync(videoPath)) return res.status(404).json({ error: 'Not found' });

  fs.unlinkSync(videoPath);
  [thumbJpgFromVideo(id), slateSvgFromVideo(id), coverJpgFromVideo(id)]
    .map(f => path.join(UPLOAD_DIR, f))
    .forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });

  const meta = loadMeta();
  delete meta.items[id];
  saveMeta(meta);

  res.json({ ok: true });
});

// Regenerate clean slate cover with optional theme ?theme=midnight|chalk|paper
app.post('/api/videos/:id/slate', (req, res) => {
  const { id } = req.params;
  const theme = (req.query.theme || 'midnight').toLowerCase();
  const meta = loadMeta();
  const title = meta.items[id]?.title ?? id.replace(/^\d+__/, '').replace(/\.[^/.]+$/, '');
  const svgFull = path.join(UPLOAD_DIR, slateSvgFromVideo(id));
  try {
    writeSlateSVG(title, svgFull, theme);
    res.json({ ok: true, slate: `/uploads/${encodeURIComponent(path.basename(svgFull))}` });
  } catch (e) {
    res.status(500).json({ error: 'Slate generation failed' });
  }
});

// Upload a custom cover image
app.post('/api/videos/:id/cover', coverUpload.single('cover'), (req, res) => {
  const { id } = req.params;
  const cover = path.join(UPLOAD_DIR, coverJpgFromVideo(id));
  if (!fs.existsSync(cover)) return res.status(500).json({ error: 'Cover not saved' });
  res.json({ ok: true, cover: `/uploads/${encodeURIComponent(path.basename(cover))}` });
});

/* ---------- Start server (single listener) ---------- */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Roniz uploader running on port ${PORT}`);
});

