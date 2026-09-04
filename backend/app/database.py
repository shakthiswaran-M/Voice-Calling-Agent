import json
from uuid import uuid4
from collections.abc import Iterable
from typing import Any

import asyncpg

from app.config import settings

# ============================================================
# REFERENCE DATA (real business content, seeded on startup)
# ============================================================

SERVICES = [
    ("AI/ML", "AI/ML", "AI and machine learning solutions for business needs."),
    ("chatbots", "Chatbots", "Intelligent chatbot solutions for customer and business interactions."),
    ("SaaS development", "SaaS Development", "Scalable software-as-a-service application development."),
    ("enterprise applications", "Enterprise Applications", "Enterprise-grade applications designed for business operations."),
    ("cloud/migration", "Cloud / Migration", "Cloud solutions and migration support for modernizing applications and infrastructure."),
    ("DevOps", "DevOps", "DevOps solutions for development, deployment, automation, and operations."),
    ("IT consulting", "IT Consulting", "IT consulting services to help organizations plan and implement technology solutions."),
    ("enterprise architecture", "Enterprise Architecture", "Enterprise architecture solutions for designing scalable technology systems."),
]

CASE_STUDIES = [
    ("APPGM", "APPGM", "APPGM case study."),
    ("HEB", "HEB", "HEB case study."),
    ("WhyScience", "WhyScience", "WhyScience case study."),
]

FAQS = [
    ("iso 27001", "ISO 27001", "NetKathir's ISO 27001 information should be provided from the company's approved FAQ information."),
    ("founded", "Company founding year", "NetKathir was founded in 2015."),
    ("engagement process", "Engagement process", "NetKathir's typical engagement process should follow the company's approved engagement workflow."),
]


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

    # ------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------

    async def connect(self) -> None:
        self.pool = await asyncpg.create_pool(
            self.database_url,
            min_size=self.pool_min_size,
            max_size=self.pool_max_size,
        )
        await self._create_schema()

    async def close(self) -> None:
        if self.pool is not None:
            await self.pool.close()
            self.pool = None

    # ------------------------------------------------------------
    # Schema + seeding
    # ------------------------------------------------------------

    async def _create_schema(self) -> None:
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
                customer_id TEXT NOT NULL REFERENCES customers(customer_id),
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

            CREATE TABLE IF NOT EXISTS leads (
                lead_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                company TEXT NOT NULL,
                requirement TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'new'
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

            CREATE TABLE IF NOT EXISTS services (
                key TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS case_studies (
                key TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS faqs (
                key TEXT PRIMARY KEY,
                topic TEXT NOT NULL,
                answer TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS messages_session_id_timestamp_idx
                ON messages (session_id, timestamp);
            """
        )

        await self._seed_reference_data()

    async def _seed_reference_data(self) -> None:
        """Seeds real business content — services, case studies, FAQs."""
        pool = self._require_pool()

        await pool.executemany(
            """
            INSERT INTO services (key, name, description)
            VALUES ($1, $2, $3)
            ON CONFLICT (key) DO NOTHING
            """,
            SERVICES,
        )

        await pool.executemany(
            """
            INSERT INTO case_studies (key, name, description)
            VALUES ($1, $2, $3)
            ON CONFLICT (key) DO NOTHING
            """,
            CASE_STUDIES,
        )

        await pool.executemany(
            """
            INSERT INTO faqs (key, topic, answer)
            VALUES ($1, $2, $3)
            ON CONFLICT (key) DO NOTHING
            """,
            FAQS,
        )

    # ------------------------------------------------------------
    # Conversation management
    # ------------------------------------------------------------

    async def ensure_conversation(self, session_id: str) -> None:
        """Creates a conversation row if one doesn't already exist."""
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
        """Deletes conversations that haven't been updated."""
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

    # ------------------------------------------------------------
    # Generic query helpers
    # ------------------------------------------------------------

    async def fetchrow(
        self,
        query: str,
        *args: Any,
    ) -> asyncpg.Record | None:
        return await self._require_pool().fetchrow(query, *args)

    async def fetch(
        self,
        query: str,
        *args: Any,
    ) -> list[asyncpg.Record]:
        return await self._require_pool().fetch(query, *args)

    async def fetchval(
        self,
        query: str,
        *args: Any,
    ) -> Any:
        return await self._require_pool().fetchval(query, *args)

    async def execute(
        self,
        query: str,
        *args: Any,
    ) -> str:
        return await self._require_pool().execute(query, *args)

    # ------------------------------------------------------------
    # Messages
    # ------------------------------------------------------------

    async def get_messages(
        self,
        session_id: str,
    ) -> list[dict[str, Any]]:
        """Returns all messages for a session, oldest first."""
        pool = self._require_pool()

        rows = await pool.fetch(
            """
            SELECT id, role, content
            FROM messages
            WHERE session_id = $1
            ORDER BY timestamp, id
            """,
            session_id,
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
        """Saves user/assistant messages for a session."""
        pool = self._require_pool()

        async with pool.acquire() as connection:
            async with connection.transaction():
                for message in messages:
                    if message.get("role") == "tool":
                        continue

                    if (
                        message.get("role") == "assistant"
                        and message.get("tool_calls")
                    ):
                        continue

                    content = message.get("content") or ""

                    await connection.execute(
                        """
                        INSERT INTO messages
                            (id, session_id, role, content)
                        VALUES
                            ($1, $2, $3, $4)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        str(uuid4()),
                        session_id,
                        message["role"],
                        (
                            content
                            if isinstance(content, str)
                            else json.dumps(content)
                        ),
                    )

                await connection.execute(
                    """
                    UPDATE conversations
                    SET updated_at = NOW()
                    WHERE session_id = $1
                    """,
                    session_id,
                )

    # ------------------------------------------------------------
    # Context (per-conversation memory)
    # ------------------------------------------------------------

    async def get_context(
        self,
        session_id: str,
    ) -> dict[str, Any]:
        """Returns the stored context dict for a conversation."""
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
        """Overwrites the stored context dict for a conversation."""
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

    # ------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------

    def _require_pool(self) -> asyncpg.Pool:
        if self.pool is None:
            raise RuntimeError(
                "Database connection pool is not initialized"
            )

        return self.pool


database = Database(
    settings.database_url,
    pool_min_size=settings.db_pool_min_size,
    pool_max_size=settings.db_pool_max_size,
)