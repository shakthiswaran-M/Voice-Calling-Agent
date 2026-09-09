import json
from uuid import uuid4
from collections.abc import Iterable
from typing import Any

import asyncpg

from app.config import settings


class Database:
    """Manages the PostgreSQL connection pool and all data access."""

    def __init__(
        self,
        database_url: str,
        pool_min_size: int = 1,
        pool_max_size: int = 10,
    ):
        self.database_url = database_url
        self.pool_min_size = pool_min_size
        self.pool_max_size = pool_max_size
        self.pool: asyncpg.Pool | None = None

    # ============================================================
    # CONNECTION LIFECYCLE
    # ============================================================

    async def connect(self) -> None:
        """Create the PostgreSQL connection pool and database schema."""

        self.pool = await asyncpg.create_pool(
            self.database_url,
            min_size=self.pool_min_size,
            max_size=self.pool_max_size,
        )

        await self._create_schema()

    async def close(self) -> None:
        """Close the PostgreSQL connection pool."""

        if self.pool is not None:
            await self.pool.close()
            self.pool = None

    # ============================================================
    # DATABASE SCHEMA
    # ============================================================

    async def _create_schema(self) -> None:
        """Create the application database tables if they don't exist."""

        pool = self._require_pool()

        await pool.execute(
            """
            CREATE TABLE IF NOT EXISTS customers (
                customer_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                phone TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS appointments (
                id TEXT PRIMARY KEY,
                customer_id TEXT NOT NULL
                    REFERENCES customers(customer_id),
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                status TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversations (
                session_id TEXT PRIMARY KEY,
                customer_id TEXT REFERENCES customers(customer_id),
                context JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL
                    REFERENCES conversations(session_id)
                    ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            
            CREATE TABLE IF NOT EXISTS consultations (
                consultation_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                contact TEXT NOT NULL,
                preferred_time TEXT NOT NULL,
                topic TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'requested'
            );

            CREATE TABLE IF NOT EXISTS consultation_slots (
                id BIGSERIAL PRIMARY KEY,
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                available BOOLEAN NOT NULL DEFAULT TRUE
            );

            CREATE TABLE IF NOT EXISTS website_content (
                id BIGSERIAL PRIMARY KEY,
                url TEXT UNIQUE NOT NULL,
                title TEXT,
                content TEXT NOT NULL,
                content_hash TEXT,
                last_scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS messages_session_id_timestamp_idx
                ON messages (session_id, timestamp);

            CREATE INDEX IF NOT EXISTS website_content_url_idx
                ON website_content (url);

            CREATE INDEX IF NOT EXISTS website_content_title_idx
                ON website_content (title);
            """
        )

    # ============================================================
    # CONVERSATION MANAGEMENT
    # ============================================================

    async def ensure_conversation(self, session_id: str) -> None:
        """Create a conversation row if it doesn't already exist."""

        pool = self._require_pool()

        await pool.execute(
            """
            INSERT INTO conversations (session_id)
            VALUES ($1)
            ON CONFLICT (session_id) DO NOTHING
            """,
            session_id,
        )

    async def cleanup_old_conversations(
        self,
        older_than_days: int | None = None,
    ) -> None:
        """Delete conversations that have not been updated recently."""

        days = (
            older_than_days
            if older_than_days is not None
            else settings.conversation_retention_days
        )

        pool = self._require_pool()

        await pool.execute(
            """
            DELETE FROM conversations
            WHERE updated_at < NOW() - ($1 || ' days')::interval
            """,
            str(days),
        )

    # ============================================================
    # GENERIC QUERY HELPERS
    # ============================================================

    async def fetchrow(
        self,
        query: str,
        *args: Any,
    ) -> asyncpg.Record | None:
        """Execute a query and return one row."""

        return await self._require_pool().fetchrow(query, *args)

    async def fetch(
        self,
        query: str,
        *args: Any,
    ) -> list[asyncpg.Record]:
        """Execute a query and return all rows."""

        return await self._require_pool().fetch(query, *args)

    async def fetchval(
        self,
        query: str,
        *args: Any,
    ) -> Any:
        """Execute a query and return a single value."""

        return await self._require_pool().fetchval(query, *args)

    async def execute(
        self,
        query: str,
        *args: Any,
    ) -> str:
        """Execute a database command."""

        return await self._require_pool().execute(query, *args)

    # ============================================================
    # MESSAGES
    # ============================================================

    async def get_messages(
        self,
        session_id: str,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        """
        Return recent messages for a session.

        The limit prevents conversation history from growing
        indefinitely inside the LLM request.
        """

        pool = self._require_pool()

        rows = await pool.fetch(
            """
            SELECT id, role, content
            FROM (
                SELECT id, role, content, timestamp
                FROM messages
                WHERE session_id = $1
                ORDER BY timestamp DESC, id DESC
                LIMIT $2
            ) recent_messages
            ORDER BY timestamp, id
            """,
            session_id,
            limit,
        )

        return [
            {
                "role": row["role"],
                "content": row["content"],
            }
            for row in rows
        ]

    async def add_messages(
        self,
        session_id: str,
        messages: Iterable[dict[str, Any]],
    ) -> None:
        """Save user and assistant messages for a session."""

        pool = self._require_pool()

        async with pool.acquire() as connection:
            async with connection.transaction():

                for message in messages:

                    # Tool messages are not stored as normal chat messages.
                    if message.get("role") == "tool":
                        continue

                    # Tool-call assistant messages are not stored as
                    # normal conversation messages.
                    if (
                        message.get("role") == "assistant"
                        and message.get("tool_calls")
                    ):
                        continue

                    content = message.get("content") or ""

                    if not isinstance(content, str):
                        content = json.dumps(content)

                    await connection.execute(
                        """
                        INSERT INTO messages (
                            id,
                            session_id,
                            role,
                            content
                        )
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        str(uuid4()),
                        session_id,
                        message["role"],
                        content,
                    )

                await connection.execute(
                    """
                    UPDATE conversations
                    SET updated_at = NOW()
                    WHERE session_id = $1
                    """,
                    session_id,
                )

    # ============================================================
    # CONVERSATION CONTEXT
    # ============================================================

    async def get_context(
        self,
        session_id: str,
    ) -> dict[str, Any]:
        """Return the stored context for a conversation."""

        pool = self._require_pool()

        context = await pool.fetchval(
            """
            SELECT context
            FROM conversations
            WHERE session_id = $1
            """,
            session_id,
        )

        if not context:
            return {}

        if isinstance(context, str):
            return json.loads(context)

        return dict(context)

    async def save_context(
        self,
        session_id: str,
        context: dict[str, Any],
    ) -> None:
        """Overwrite the stored context for a conversation."""

        pool = self._require_pool()

        await pool.execute(
            """
            UPDATE conversations
            SET
                context = $2::jsonb,
                updated_at = NOW()
            WHERE session_id = $1
            """,
            session_id,
            json.dumps(context),
        )

    # ============================================================
    # WEBSITE CONTENT
    # ============================================================

    async def save_website_content(
        self,
        url: str,
        title: str,
        content: str,
        content_hash: str,
    ) -> None:
        """
        Save or update scraped website content.

        The website is the source of truth for company information.
        """

        pool = self._require_pool()

        await pool.execute(
            """
            INSERT INTO website_content (
                url,
                title,
                content,
                content_hash,
                last_scraped_at
            )
            VALUES ($1, $2, $3, $4, NOW())

            ON CONFLICT (url)
            DO UPDATE SET
                title = EXCLUDED.title,
                content = EXCLUDED.content,
                content_hash = EXCLUDED.content_hash,
                last_scraped_at = NOW()
            """,
            url,
            title,
            content,
            content_hash,
        )

    async def get_website_content(self) -> str:
        """Return all scraped website content."""

        pool = self._require_pool()

        rows = await pool.fetch(
            """
            SELECT title, content
            FROM website_content
            ORDER BY url
            """
        )

        return "\n\n".join(
            f"## {row['title'] or 'Untitled'}\n{row['content']}"
            for row in rows
        )

    async def search_website_content(
        self,
        query: str,
        limit: int = 3,
    ) -> list[dict[str, Any]]:
        """
        Search scraped website content using meaningful keywords.

        Instead of requiring the complete user sentence to exist
        inside the website, this method searches individual keywords.

        Example:

            User:
            "Where is the company located?"

        Search keywords:

            company
            located

        Contact and About pages are given higher priority because
        they commonly contain company information.
        """

        pool = self._require_pool()

        query = query.strip().lower()

        if not query:
            return []

        # Common question/filler words that do not help website search.
        stop_words = {
            "where",
            "what",
            "when",
            "how",
            "why",
            "who",
            "which",
            "is",
            "are",
            "was",
            "were",
            "the",
            "a",
            "an",
            "of",
            "to",
            "in",
            "for",
            "on",
            "at",
            "do",
            "does",
            "did",
            "can",
            "could",
            "would",
            "tell",
            "me",
            "please",
            "you",
            "your",
            "about",
        }

        keywords = [
            word.strip(".,?!:;()[]{}\"'")
            for word in query.split()
        ]

        keywords = [
            word
            for word in keywords
            if word
            and word not in stop_words
            and len(word) > 2
        ]

        if not keywords:
            keywords = [query]

        # PostgreSQL parameters start from $1.
        conditions: list[str] = []
        values: list[str] = []

        for index, keyword in enumerate(keywords, start=1):
            conditions.append(
                f"""
                (
                    title ILIKE ${index}
                    OR content ILIKE ${index}
                )
                """
            )
            values.append(f"%{keyword}%")

        # LIMIT parameter comes after all keyword parameters.
        limit_parameter = len(values) + 1
        values.append(limit)

        search_sql = f"""
            SELECT
                url,
                title,
                content
            FROM website_content
            WHERE {' OR '.join(conditions)}
            ORDER BY
                CASE
                    WHEN url ILIKE '%contact%' THEN 0
                    WHEN url ILIKE '%about%' THEN 1
                    WHEN url ILIKE '%services%' THEN 2
                    WHEN url ILIKE '%products%' THEN 3
                    ELSE 4
                END,
                url
            LIMIT ${limit_parameter}
        """

        rows = await pool.fetch(
            search_sql,
            *values,
        )

        return [dict(row) for row in rows]

    # ============================================================
    # INTERNAL
    # ============================================================

    def _require_pool(self) -> asyncpg.Pool:
        """Return the active database pool or raise an error."""

        if self.pool is None:
            raise RuntimeError(
                "Database connection pool is not initialized"
            )

        return self.pool


# ============================================================
# DATABASE INSTANCE
# ============================================================

database = Database(
    settings.database_url,
    pool_min_size=settings.db_pool_min_size,
    pool_max_size=settings.db_pool_max_size,
)