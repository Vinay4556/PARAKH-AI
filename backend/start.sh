#!/bin/bash
# Render startup script for Veritas AI Backend

# Activate virtual environment if it exists
if [ -d "/opt/render/project/src/.venv" ]; then
    source /opt/render/project/src/.venv/bin/activate
fi

# Start gunicorn
exec gunicorn app:app --workers 2 --threads 4 --timeout 120 --bind 0.0.0.0:$PORT
