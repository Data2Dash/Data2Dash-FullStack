"""Alembic environment — auto-detects DATABASE_URL from .env"""
import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv

# ── Load .env so DATABASE_URL is available ─────────────────────────────────
load_dotenv()

# ── Add backend_python to sys.path so models import correctly ──────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# ── Override sqlalchemy.url from environment if set ────────────────────────
database_url = os.getenv("DATABASE_URL")
if database_url:
    context.config.set_main_option("sqlalchemy.url", database_url)

# ── Alembic Config object ───────────────────────────────────────────────────
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Import ALL models so autogenerate detects them ─────────────────────────
from database import Base  # noqa: E402
import models               # noqa: E402, F401  (registers all ORM classes on Base)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no DB connection needed)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (live DB connection)."""
    # If DATABASE_URL is set in env, override the ini file value
    cfg_section = config.get_section(config.config_ini_section, {})
    if database_url:
        cfg_section["sqlalchemy.url"] = database_url

    connectable = engine_from_config(
        cfg_section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
