from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from visa_checker.config import get_or_create_auth_token, HOST, PORT
from visa_checker.database import get_db, close_db
from visa_checker.routers import ocr, profiles, compare


@asynccontextmanager
async def lifespan(app: FastAPI):
    token = get_or_create_auth_token()
    app.state.auth_token = token
    await get_db()
    print(f"\n  Visa Form Checker backend running at http://{HOST}:{PORT}")
    print(f"  Auth token: {token}\n")
    yield
    await close_db()


app = FastAPI(title="Visa Form Checker", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Extension origins are opaque; validated via token
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.url.path in ("/api/v1/health", "/docs", "/openapi.json"):
        return await call_next(request)
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    if token != request.app.state.auth_token:
        raise HTTPException(status_code=401, detail="Invalid or missing auth token")
    return await call_next(request)


app.include_router(ocr.router, prefix="/api/v1")
app.include_router(profiles.router, prefix="/api/v1")
app.include_router(compare.router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


def main():
    import os
    import uvicorn
    reload = os.environ.get("VISA_CHECKER_RELOAD", "true").lower() == "true"
    uvicorn.run("visa_checker.main:app", host=HOST, port=PORT, reload=reload)


if __name__ == "__main__":
    main()
