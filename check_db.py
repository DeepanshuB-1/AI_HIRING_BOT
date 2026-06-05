import asyncio
import asyncpg

async def test():
    conn = await asyncpg.connect("postgresql://user:pass@localhost:5433/hiringbot")
    version = await conn.fetchval("SELECT version()")
    ext = await conn.fetchval("SELECT extversion FROM pg_extension WHERE extname='vector'")
    tables = await conn.fetch("SELECT tablename FROM pg_tables WHERE schemaname='public'")
    cols = await conn.fetch("""
        SELECT table_name, column_name, udt_name
        FROM information_schema.columns
        WHERE udt_name = 'vector' AND table_schema = 'public'
        ORDER BY table_name
    """)
    indexes = await conn.fetch("""
        SELECT indexname, tablename FROM pg_indexes
        WHERE schemaname='public' AND indexname LIKE '%hnsw%'
    """)
    print("PostgreSQL:", version[:50])
    print("pgvector extension:", ext)
    print("Tables:", [r["tablename"] for r in tables])
    print("Vector columns:", [(r["table_name"], r["column_name"]) for r in cols])
    print("HNSW indexes:", [(r["indexname"], r["tablename"]) for r in indexes])
    await conn.close()

asyncio.run(test())
