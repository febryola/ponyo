import os

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test.db")
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("FRONTEND_ORIGINS", "http://testserver")
