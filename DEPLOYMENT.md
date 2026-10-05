# Deploying Veritas AI — Vercel (frontend) + Railway (backend) + PostgreSQL

```
Browser ──► Vercel (React app)
              │  /api/*  is rewritten by frontend/vercel.json
              ▼
           Railway (Flask + gunicorn) ──► PostgreSQL
```
The browser only ever talks to your Vercel domain, so there is no CORS to configure
and the login `POST /api/auth/login` can no longer hit the static host (that was the 405).

---------------------------------------------------------------------------------------

## 0. Before you start — rotate leaked secrets
A database password and the API keys in `backend/.env` have been shared in chat/zip files.
Create a **new database password** and new API keys, and put them only in Railway "Variables".
`.env` is git-ignored — never commit it.

## 1. Database
Pick ONE:

**A. Railway Postgres (simplest).** In your Railway project: *New → Database → PostgreSQL*.
In the backend service Variables add `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`.

**B. Supabase.** *Project Settings → Database → Connection string → "Session pooler"*
(host `aws-0-….pooler.supabase.com`, user `postgres.<project-ref>`). Do **not** use the direct
`db.<ref>.supabase.co` host from Railway — it is IPv6-only and fails to connect.
If the password has `@ # / :` characters, URL-encode them (`@`→`%40`, `#`→`%23`, `/`→`%2F`).

Any of `postgres://…`, `postgresql://…`, `postgresql+psycopg2://…` is accepted.
Tables are created and demo data is seeded automatically on first boot. An older database
(created by the previous version) is upgraded in place — no manual migration.

## 2. Backend on Railway
1. Railway → *New Project → Deploy from GitHub repo* → pick the repo.
2. Service **Settings → Root Directory = `backend`**. (`railway.json` + `Procfile` supply the start
   command and the `/api/health` health check.)
3. **Variables** (Settings → Variables):

| Variable | Value |
|---|---|
| `DATABASE_URL` | from step 1 |
| `SECRET_KEY` | long random string: `python -c "import secrets;print(secrets.token_hex(32))"` |
| `DB_STRICT` | `1` once everything works (fail loudly instead of silently using SQLite) |
| `GOV_ADAPTER_MODE` | `MOCK` (demo) or `LIVE` |
| `GROK_API_KEY` | your Groq key (chatbot) — optional |
| other API keys | optional, see `backend/.env.example` |

4. *Settings → Networking → Generate Domain*. Open `https://<domain>/api/health` — expect
   `"database":"connected","db_mode":"postgresql"`.
   `db_mode: sqlite-fallback` means `DATABASE_URL` is wrong; `db_error` says why.
5. **Uploads survive redeploys only with a Volume:** *Add Volume* mounted at `/data`, then set
   `UPLOAD_DIR=/data/uploads` and `REPORTS_DIR=/data/reports`.

## 3. Frontend on Vercel
1. *Add New Project* → import the repo → **Root Directory = `frontend`**. Framework preset: Vite
   (build `npm run build`, output `dist`). Node 20.19+ / 22 (set by `engines`).
2. Open `frontend/vercel.json` and make sure the `destination` host is **your** Railway domain
   (it currently points at `overflowing-quietude-production-d034.up.railway.app`).
3. **Do not set `VITE_API_URL`** (leave the variable absent). Deploy.
4. Open the site, log in with `officer@demo.gov` / `password`.

Demo accounts: `officer@demo.gov`, `bidder@demo.com`, `citizen@demo.com` — password `password`
(change them in Settings → change password; passwords are re-hashed on change).

> Only one `vercel.json` should exist (`frontend/vercel.json`). The old root-level one and the
> Vercel-serverless backend files were removed — Flask now runs only on Railway.

### Alternative: call Railway directly (no rewrite)
Set `VITE_API_URL=https://<railway-domain>` in Vercel (Production + Preview) and **redeploy**
(Vite bakes it in at build time). Then add your Vercel domain to `CORS_ORIGINS` on Railway
(`https://veritas-ai-frontend.vercel.app` and `*veritas-ai*.vercel.app` previews are already allowed).
Use this if uploads > ~4 MB fail through the Vercel proxy.

## 4. Verify the deployment (2 minutes)
```bash
pip install requests
python backend/tests/smoke_test.py https://<your-site>.vercel.app    # through Vercel
python backend/tests/smoke_test.py https://<railway-domain>          # backend directly
```
115 checks: logins, every endpoint, role protection, create/read-back flows. It creates a few
records named "SMOKE …" — run it against a demo database.

## 5. Local development
```bash
cd backend && pip install -r requirements.txt && python app.py      # :5000, SQLite, zero config
cd frontend && npm install && npm run dev                           # :3000, proxies /api → :5000
```
Leave `DATABASE_URL` empty in `backend/.env` for SQLite; set it to test against Postgres.
Use `python -m database.seed_db` to (re)seed manually.

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| 405 on login | Request reached the static host. Check `frontend/vercel.json` is the one in the **frontend** root and Root Directory is `frontend`. |
| 502 / "Application failed to respond" | Railway Root Directory not `backend`, or a crash — read Deploy Logs. |
| `/api/health` → `sqlite-fallback` | `DATABASE_URL` unreachable; see `db_error`. Supabase: use the pooler URL. |
| Logged out right after login | Different `SECRET_KEY` per instance. Set one `SECRET_KEY` variable. |
| CORS error in console | Only when using `VITE_API_URL`; add the origin to `CORS_ORIGINS`. |
| Uploaded documents vanish after deploy | Add the Railway Volume (step 2.5). |
| Translation to other languages slow/empty | LibreTranslate isn't deployed; it falls back to Google/MyMemory public APIs (cached in the DB-less file cache). |

## Other ways to deploy
* **Everything on Railway/Render** (one service serving `frontend/dist` from Flask): one URL, no proxy;
  needs a small Flask static route — ask and I'll add it.
* **Render**: backend as a Web Service (`rootDir backend`, start = `Procfile` command), frontend as a
  Static Site with a rewrite `/api/*` → backend. Same environment variables as above.
