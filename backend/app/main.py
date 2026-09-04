import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.api.chat import router as chat_router
from app.api.voice import router as voice_router
from app.database import database
from app.config import settings
from app.website_scraper import scrape_and_save

app = FastAPI(title="AI Voice Calling Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(voice_router)

scheduler = AsyncIOScheduler()


@app.on_event("startup")
async def startup() -> None:
    await database.connect()

    # Run once immediately on startup (in the background, doesn't block startup)
    asyncio.create_task(scrape_and_save())

    # Then run automatically every 24 hours
    scheduler.add_job(scrape_and_save, "interval", hours=24)
    scheduler.start()


@app.on_event("shutdown")
async def shutdown() -> None:
    scheduler.shutdown()
    await database.close()


@app.get("/api/health")
async def health():
    return {"status": "ok"}