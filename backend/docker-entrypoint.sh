#!/bin/sh
set -e

echo "Applying database migrations..."
alembic upgrade head

if [ "${SEED_DEMO_DATA:-true}" = "true" ]; then
  echo "Seeding demo data (safe to run repeatedly)..."
  python -m scripts.seed
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"
