# Deploy to Render — Roniz Uploader

## Push to GitHub
```bash
git init
git branch -M main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<YOUR_USERNAME>/roniz-uploader.git
git push -u origin main
```

## Create the Render Service
1. Go to https://dashboard.render.com → **New** → **Web Service** → connect GitHub → pick repo.
2. Settings:
   - Environment: **Node**
   - Build Command: `npm install`
   - Start Command: `node server.js`
3. Add a **Persistent Disk**:
   - Name: `uploads`
   - Mount Path: `/opt/render/project/src/uploads`
   - Size: `10 GB` (or your choice)
4. Click **Create Web Service**.

Your app will deploy to `https://<your-app>.onrender.com`. Share this URL with your partner.

### Notes
- Anyone with the URL can upload. Add auth before sharing widely.
- Render auto-deploys when you push to `main`.
