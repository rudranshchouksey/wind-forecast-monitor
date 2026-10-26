"""Vercel Python function entrypoint.

Vercel routes /api/* here (vercel.json). The bundled SQLite snapshot is opened read-only because
the function filesystem is read-only; the refresh endpoint is therefore disabled.
"""

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

os.environ.setdefault("APP_DATABASE_READ_ONLY", "true")
os.environ.setdefault("APP_DATABASE_PATH", str(BACKEND / "data" / "wind.sqlite"))
os.environ.setdefault("APP_CORS_ORIGINS", "[]")

from app.main import app  # noqa: E402

__all__ = ["app"]
