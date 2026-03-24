import os
import secrets
from pathlib import Path

APP_DIR = Path(os.environ.get("VISA_CHECKER_DATA_DIR", Path.home() / ".visa-checker"))
DB_PATH = APP_DIR / "profiles.db"
AUTH_TOKEN_PATH = APP_DIR / "auth_token"
HOST = os.environ.get("VISA_CHECKER_HOST", "127.0.0.1")
PORT = int(os.environ.get("VISA_CHECKER_PORT", "5050"))


def ensure_app_dir():
    APP_DIR.mkdir(parents=True, exist_ok=True)


def get_or_create_auth_token() -> str:
    ensure_app_dir()
    if AUTH_TOKEN_PATH.exists():
        return AUTH_TOKEN_PATH.read_text().strip()
    token = secrets.token_urlsafe(32)
    AUTH_TOKEN_PATH.write_text(token)
    os.chmod(AUTH_TOKEN_PATH, 0o600)
    return token
