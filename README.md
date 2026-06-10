# 💳 IB Digital Banker

Real-time multiplayer digital money manager for the **International Business** board game.  
Built with **React + Vite** (frontend) and **Node.js + Socket.io** (backend).

---

## 🗂 Project Structure

```
ib-digital-banker/
├── backend/          ← Node.js + Socket.io server  (deploy to Render)
│   ├── server.js
│   ├── package.json
│   └── render.yaml
└── frontend/         ← React + Vite app             (deploy to Vercel)
    ├── src/
    ├── vercel.json
    ├── .env.development
    ├── .env.production   ← edit this before deploying
    └── package.json
```

---

## 🖥 Local Development

### 1 — Backend

```bash
cd backend
npm install
npm run dev        # starts on http://localhost:4000 with nodemon
```

### 2 — Frontend

```bash
cd frontend
npm install
# .env.development already points to http://localhost:4000
npm run dev        # starts on http://localhost:5173
```

### 3 — Test on phones / tablets (same WiFi)

1. Find your machine's LAN IP (e.g. `192.168.1.5`):
   - Windows: `ipconfig`
   - Mac/Linux: `ifconfig`
2. Edit `frontend/.env.development`:
   ```
   VITE_BACKEND_URL=http://192.168.1.5:4000
   ```
3. Open `http://192.168.1.5:5173` on any device on the same network.

---

## 🚀 Deployment

### Step 1 — Deploy Backend to Render

1. Push this repo to GitHub.
2. Go to [render.com](https://render.com) → **New → Web Service**.
3. Connect your GitHub repo and select the **`backend`** folder as root directory.
4. Settings:
   | Field          | Value              |
   |----------------|--------------------|
   | **Runtime**    | Node                |
   | **Build cmd**  | `npm install`       |
   | **Start cmd**  | `node server.js`    |
   | **Plan**       | Free                |
5. Add environment variable:
   | Key            | Value                             |
   |----------------|-----------------------------------|
   | `FRONTEND_URL` | *(set after Vercel deploy below)* |
6. Deploy. Copy the URL — looks like `https://ib-digital-banker-backend.onrender.com`.

### Step 2 — Deploy Frontend to Vercel

1. Edit **`frontend/.env.production`**:
   ```
   VITE_BACKEND_URL=https://ib-digital-banker-backend.onrender.com
   ```
2. Go to [vercel.com](https://vercel.com) → **New Project** → import your GitHub repo.
3. Settings:
   | Field              | Value        |
   |--------------------|--------------|
   | **Framework**      | Vite         |
   | **Root directory** | `frontend`   |
   | **Build cmd**      | `npm run build` |
   | **Output dir**     | `dist`       |
4. Deploy. Copy the Vercel URL — looks like `https://ib-digital-banker.vercel.app`.

### Step 3 — Wire them together

Back in Render, set the `FRONTEND_URL` environment variable to your Vercel URL:
```
FRONTEND_URL=https://ib-digital-banker.vercel.app
```
Trigger a re-deploy on Render. Done!

---

## ⚙️ Environment Variables

### Backend (`backend/`)

| Variable       | Required | Description                                     |
|----------------|----------|-------------------------------------------------|
| `PORT`         | No       | Port to listen on (default `4000`, Render sets `10000`) |
| `FRONTEND_URL` | Yes (prod) | Your Vercel URL — used for CORS allow-list    |

### Frontend (`frontend/`)

| Variable            | Required | Description                         |
|---------------------|----------|-------------------------------------|
| `VITE_BACKEND_URL`  | Yes      | Full URL of the Render backend       |

---

## 🎮 Game Features

- Banker creates a room and shares a 6-character code
- Players join and wait for banker approval
- Real-time balance updates via Socket.io
- Credit card system ($10,000 loan, 6 × $2,000 repayments)
- Jail send/release, passport suspend/restore
- Party House & Resort special events
- Auto game-end when timer expires
- Full reconnect support — refresh the page without losing your session
- History: players see only their own transactions; banker sees all

---

## 🔧 Render Free Tier Note

Render free instances **spin down after 15 minutes of inactivity** and take ~30 seconds to wake up on the next request. During this cold start players will see "Reconnecting…" briefly, then the connection will restore automatically.

To avoid cold starts, upgrade to Render's Starter plan ($7/mo) or set up an external uptime monitor (e.g. UptimeRobot) to ping `https://your-render-app.onrender.com/` every 10 minutes.
