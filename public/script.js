const listEl = document.getElementById('list');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const themeSelect = document.getElementById('theme');

attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  if (!fileInput.files.length) return;
  await uploadFiles(fileInput.files);
  fileInput.value = '';
  await fetchVideos();
});

// drag & drop
['dragenter','dragover'].forEach(evt => dropzone.addEventListener(evt, e => {
  e.preventDefault(); e.stopPropagation(); dropzone.classList.add('drag');
}));
['dragleave','drop'].forEach(evt => dropzone.addEventListener(evt, e => {
  e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('drag');
}));
dropzone.addEventListener('drop', async e => {
  const files = e.dataTransfer.files;
  if (files && files.length) {
    await uploadFiles(files);
    await fetchVideos();
  }
});

async function uploadFiles(files) {
  const fd = new FormData();
  Array.from(files).forEach(f => fd.append('files', f));
  attachBtn.disabled = true;
  await fetch('/api/upload', { method: 'POST', body: fd });
  attachBtn.disabled = false;
}

async function fetchVideos() {
  const res = await fetch('/api/videos');
  const data = await res.json();
  renderList(data.items || []);
}

function renderList(items) {
  listEl.innerHTML = '';
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'card';

    const square = document.createElement('div');
    square.className = 'square';
    if (item.thumb) square.style.backgroundImage = `url(${item.thumb})`;
    square.title = 'Click to preview';
    square.addEventListener('click', e => {
      e.preventDefault();
      window.open(item.url, '_blank');
    });

    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = new Date(item.uploadedAt).toLocaleDateString();

    const row = document.createElement('div');
    row.className = 'row';

    const name = document.createElement('input');
    name.className = 'name';
    name.value = item.title;
    name.addEventListener('dblclick', () => name.select());

    const save = btn('Save', 'ok', async () => {
      await fetch(`/api/videos/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ title: name.value })
      });
      // also rebuild slate with same theme on rename
      await fetch(`/api/videos/${encodeURIComponent(item.id)}/slate?theme=${encodeURIComponent(themeSelect.value)}`, { method:'POST' });
      await fetchVideos();
    });

    const del = btn('Delete', 'danger', async () => {
      if (!confirm('Delete this video?')) return;
      await fetch(`/api/videos/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      await fetchVideos();
    });

    const slate = btn('Slate cover', '', async () => {
      slate.disabled = true;
      await fetch(`/api/videos/${encodeURIComponent(item.id)}/slate?theme=${encodeURIComponent(themeSelect.value)}`, { method:'POST' });
      slate.disabled = false;
      await fetchVideos();
    });

    const uploadCover = btn('Upload cover', '', () => coverInput.click());
    const coverInput = document.createElement('input');
    coverInput.type = 'file';
    coverInput.accept = 'image/jpeg,image/png,image/webp';
    coverInput.hidden = true;
    coverInput.addEventListener('change', async () => {
      const f = coverInput.files[0];
      if (!f) return;
      const fd = new FormData();
      fd.append('cover', f);
      uploadCover.disabled = true;
      await fetch(`/api/videos/${encodeURIComponent(item.id)}/cover`, { method:'POST', body: fd });
      uploadCover.disabled = false;
      await fetchVideos();
    });

    row.append(name, save, del, slate, uploadCover, coverInput);
    card.append(square, badge, row);
    listEl.appendChild(card);
  }
}

function btn(label, kind, onClick){
  const b = document.createElement('button');
  b.textContent = label;
  b.className = `btn ${kind||''}`;
  b.addEventListener('click', onClick);
  return b;
}

fetchVideos();
