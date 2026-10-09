"""SQLite engine. The URL is read on first use so tests can point at a temp file."""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_ROOT / "data"
DEFAULT_URL = "sqlite:///" + (DATA_DIR / "zoom.db").as_posix()

SessionLocal = sessionmaker(autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def database_url() -> str:
    configured = os.getenv("DATABASE_URL")
    if configured:
        return configured
    # Vercel functions can only write under /tmp, and each instance gets its own file.
    if os.getenv("VERCEL"):
        return "sqlite:////tmp/zoom.db"
    return DEFAULT_URL


def init_db() -> None:
    url = database_url()
    if url.startswith("sqlite:///"):
        db_file = url[len("sqlite:///") :]
        if db_file not in ("", ":memory:"):
            Path(db_file).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(url, connect_args={"check_same_thread": False})
    SessionLocal.configure(bind=engine)
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    from app.seed import seed

    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()


def get_db():
    if SessionLocal.kw.get("bind") is None:
        init_db()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
