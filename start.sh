#!/usr/bin/env bash
# Local development: backend on :5000, frontend on :3000 (proxying /api to the backend).
set -e
cd "$(dirname "$0")"
[ -f backend/.env ] || cp backend/.env.example backend/.env
( cd backend && pip install -r requirements.txt && python app.py ) &
( cd frontend && npm install && npm run dev ) &
wait
