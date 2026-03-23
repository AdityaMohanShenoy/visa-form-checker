import aiosqlite
from pathlib import Path

from visa_checker.config import DB_PATH, ensure_app_dir

SCHEMA_PATH = Path(__file__).parent / "db" / "schema.sql"

_db: aiosqlite.Connection | None = None


async def get_db() -> aiosqlite.Connection:
    global _db
    if _db is None:
        ensure_app_dir()
        _db = await aiosqlite.connect(str(DB_PATH))
        _db.row_factory = aiosqlite.Row
        await _db.execute("PRAGMA foreign_keys = ON")
        schema = SCHEMA_PATH.read_text()
        await _db.executescript(schema)
        await _db.commit()
    return _db


async def close_db():
    global _db
    if _db is not None:
        await _db.close()
        _db = None
