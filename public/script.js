const listEl = document.getElementById('videoList');
const fileInput = document.getElementById('fileInput');

async function fetchVideos() {
  const res = await fetch('/api/videos');
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
    // Right-click preview in a new tab
    square.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      window.open(item.url, '_blank');
    });
    // Left-click also opens
    square.addEventListener('click', () => window.open(item.url, '_blank'));
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
    row.appendChild(name); row.appendChild(save);
    card.appendChild(square); card.appendChild(row);
    listEl.appendChild(card);
  }
}

fetchVideos();
