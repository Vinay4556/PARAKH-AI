@echo off
cd /d "%~dp0"
if not exist backend\.env copy backend\.env.example backend\.env
start "Veritas backend" cmd /k "cd backend && pip install -r requirements.txt && python app.py"
start "Veritas frontend" cmd /k "cd frontend && npm install && npm run dev"
