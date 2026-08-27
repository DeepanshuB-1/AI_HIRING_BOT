from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from .config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=settings.db_pool_timeout,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
        # Additive column migrations — safe to run on every startup (IF NOT EXISTS is idempotent)
        migrations = [
            # candidate_users: profile fields added in UI redesign
            "ALTER TABLE candidate_users ADD COLUMN IF NOT EXISTS headline VARCHAR(300)",
            "ALTER TABLE candidate_users ADD COLUMN IF NOT EXISTS location VARCHAR(200)",
            "ALTER TABLE candidate_users ADD COLUMN IF NOT EXISTS years_experience INTEGER",
            "ALTER TABLE candidate_users ADD COLUMN IF NOT EXISTS skills TEXT[]",
            "ALTER TABLE candidate_users ADD COLUMN IF NOT EXISTS job_alerts BOOLEAN NOT NULL DEFAULT false",
            # jobs: salary fields
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_min INTEGER",
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_max INTEGER",
            # hr_notifications: tenant ownership. Nullable so existing rows survive;
            # legacy rows with NULL are never returned to any user.
            "ALTER TABLE hr_notifications ADD COLUMN IF NOT EXISTS hr_user_id UUID",
            "CREATE INDEX IF NOT EXISTS ix_hr_notifications_hr_user_id "
            "ON hr_notifications (hr_user_id)",
            # screening_calls: one-shot pre-call reminder guard
            "ALTER TABLE screening_calls ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP",
        ]
        for sql in migrations:
            await conn.execute(text(sql))
