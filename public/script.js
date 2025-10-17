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
function generateThumbnail(url, square) {
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  let done = false;
  const fail = () => {
    if (done) return;
    done = true;
    square.textContent = 'Preview failed';
  };

  video.addEventListener('error', fail, { once: true });
  video.addEventListener('loadedmetadata', () => {
    const t = Math.min(1, Math.max(0, (video.duration || 2) * 0.1));
    video.addEventListener('seeked', () => {
      try {
        const w = video.videoWidth || 320;
        const h = video.videoHeight || 180;
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
        done = true;
      } catch {
        fail();
      }
    }, { once: true });
    try { video.currentTime = t; } catch { fail(); }
  }, { once: true });

  setTimeout(fail, 8000);
}

fetchVideos();
