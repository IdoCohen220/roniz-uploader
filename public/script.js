const listEl = document.getElementById('videoList');
const fileInput = document.getElementById('fileInput');

async function fetchVideos() {
  const res = await fetch('/api/videos', { cache: 'no-store' });
  const data = await res.json();
  renderList(data.items);
}

fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const form = new FormData();
  for (const f of files) form.append('files', f);
  await fetch('/api/upload', { method: 'POST', body: form });
  await fetchVideos();
  fileInput.value = '';
});

function renderList(items) {
  listEl.innerHTML = '';
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'card';

    const square = document.createElement('div');
    square.className = 'square';
    square.textContent = 'Loading...';
    square.title = 'Click to preview';
    square.addEventListener('click', (e) => {
      e.preventDefault();
      window.open(item.url, '_blank');
    });
    generateThumbnail(item.url, square);

    const row = document.createElement('div');
    row.className = 'row';

    const name = document.createElement('input');
    name.type = 'text';
    name.value = item.title;

    const save = document.createElement('button');
    save.textContent = 'Save';
    save.addEventListener('click', async () => {
      await fetch(`/api/videos/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: name.value })
      });
      await fetchVideos();
    });

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      if (!confirm(`Delete "${item.title}"?`)) return;
      await fetch(`/api/videos/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      await fetchVideos();
    });

    row.appendChild(name);
    row.appendChild(save);
    row.appendChild(del);

    card.appendChild(square);
    card.appendChild(row);
    listEl.appendChild(card);
  }
}

// Robust client-side thumbnail: wait for metadata → seek → draw
// Robust client-side thumbnail with multiple strategies + guaranteed fallback
function generateThumbnail(url, square) {
  let done = false;
  const finish = (ok) => { done = true; if (!ok) showFallbackVideo(url, square); };

  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';

  function tryDraw() {
    if (done) return false;
    if (!video.videoWidth || !video.videoHeight) return false;
    try {
      const w = video.videoWidth;
      const h = video.videoHeight;
      const scale = 0.25;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(w * scale));
      canvas.height = Math.max(1, Math.floor(h * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataURL = canvas.toDataURL('image/jpeg', 0.65);
      square.textContent = '';
      square.style.backgroundImage = `url(${dataURL})`;
      square.style.backgroundSize = 'cover';
      square.style.backgroundPosition = 'center';
      finish(true);
      return true;
    } catch {
      return false;
    }
  }

  function showFallbackVideo(src, square) {
    square.textContent = '';
    const v = document.createElement('video');
    v.className = 'thumb';
    v.src = src;
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    square.appendChild(v);
    v.addEventListener('loadeddata', () => {
      v.play().then(() => v.pause()).catch(() => {});
    }, { once: true });
  }

  video.addEventListener('error', () => finish(false), { once: true });

  video.addEventListener('loadedmetadata', () => {
    const t = Math.min(1, Math.max(0.1, (video.duration || 2) * 0.1));
    const onSeeked = () => {
      if (done) return;
      if (!tryDraw()) {
        video.addEventListener('canplay', () => {
          if (!tryDraw()) finish(false);
        }, { once: true });
      }
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    try {
      video.currentTime = t;
    } catch {
      video.addEventListener('canplay', () => {
        if (!tryDraw()) finish(false);
      }, { once: true });
    }
  }, { once: true });

  setTimeout(() => { if (!done) finish(false); }, 8000);
  video.src = url + '#t=0.5';
}


fetchVideos();
