import hashlib

import httpx
from bs4 import BeautifulSoup

from app.database import database

BASE_URL = "https://netkathir.com"

PAGES = [
    "/",
    "/services",
    "/products",
    "/projects",
    "/blogs",
    "/about",
    "/contact",
]


def _clean_page(html: str) -> tuple[str, str]:
    """Extracts (title, clean_text) from raw HTML."""

    soup = BeautifulSoup(html, "html.parser")

    title = soup.title.string.strip() if soup.title and soup.title.string else ""

    for element in soup(["script", "style"]):
        element.decompose()

    text = soup.get_text(separator=" ", strip=True)

    return title, text


async def scrape_and_save() -> None:
    """Scrapes all known Netkathir pages and saves/updates them in PostgreSQL."""

    async with httpx.AsyncClient(timeout=15.0) as client:
        for page in PAGES:
            url = BASE_URL + page

            try:
                response = await client.get(url)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                print(f"[scraper] failed to fetch {url}: {exc}")
                continue

            title, text = _clean_page(response.text)
            content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

            await database.save_website_content(
                url=url,
                title=title or page,
                content=text,
                content_hash=content_hash,
            )

            print(f"[scraper] saved {url} ({len(text)} chars)")