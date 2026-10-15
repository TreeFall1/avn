"""Capture the public visual assets used by the Avan Market landing page.

Run only during development. The Next.js application reads local files and fixtures.
"""

from __future__ import annotations

import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DATA = ROOT / "src" / "data"
BASE = "https://avan.market/"
session = requests.Session()
session.headers.update({"User-Agent": "Mozilla/5.0", "Accept-Language": "ru-RU,ru;q=0.9"})


def local_path(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path
    if parsed.netloc in ("avan.market", "www.avan.market"):
        if path.startswith("/_next/static/media/"):
            return "/media/" + path.rsplit("/", 1)[-1]
        return path
    digest = hashlib.sha1(url.encode()).hexdigest()[:12]
    ext = Path(path).suffix.lower()
    if ext not in (".svg", ".png", ".jpg", ".jpeg", ".webp", ".woff2", ".woff", ".ttf"):
        ext = ".png"
    return f"/external/{parsed.netloc}/{digest}{ext}"


def download(url: str) -> tuple[str, bool, str]:
    target = PUBLIC / local_path(url).lstrip("/")
    if target.exists() and target.stat().st_size:
        return url, True, local_path(url)
    try:
        result = session.get(url, timeout=25)
        result.raise_for_status()
        if not result.content:
            raise ValueError("empty response")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(result.content)
        return url, True, local_path(url)
    except Exception as exc:
        return url, False, str(exc)


def main() -> None:
    urls: set[str] = set()
    html = session.get(BASE, timeout=25)
    html.raise_for_status()
    html.encoding = "utf-8"
    soup = BeautifulSoup(html.text, "html.parser")

    for element in soup.find_all(["img", "source"]):
        for attr in ("src", "srcset"):
            value = element.get(attr, "")
            for candidate in value.split(","):
                candidate = candidate.strip().split(" ")[0]
                if candidate:
                    urls.add(urljoin(BASE, candidate))

    for link in soup.find_all("link"):
        if "icon" in " ".join(link.get("rel", [])) and link.get("href"):
            urls.add(urljoin(BASE, link["href"]))

    for link in soup.find_all("link", rel="stylesheet"):
        css_url = urljoin(BASE, link.get("href", ""))
        try:
            response = session.get(css_url, timeout=20)
            response.raise_for_status()
            response.encoding = "utf-8"
            for path in re.findall(r"url\(['\"]?([^'\")]+)", response.text):
                urls.add(urljoin(css_url, path))
        except requests.RequestException:
            pass

    # Elements and item images inserted after hydration are not in the HTML.
    for path in (
        "/assets/background/effect.svg",
        "/assets/images/lightning.webp",
        "/assets/images/beeHappy.svg",
        "/assets/images/lightningWhite.svg",
        "/assets/images/lightningWhiteWithoutBorder.svg",
        "/assets/images/authentication.webp",
        "/assets/images/userData.svg",
        "/assets/images/topography.svg",
        "/assets/carousel/coin.svg",
    ):
        urls.add(urljoin(BASE, path))

    stats = session.get(urljoin(BASE, "/v1/api/statistics?currencyId=2"), timeout=25).json()
    live = session.get(urljoin(BASE, "/v1/api/statistics/live-items?currencyId=2"), timeout=25).json()
    live = [item for item in live if item.get("Item", {}).get("gameId") == 1][:16]
    steam_prefix = "https://steamcommunity-a.akamaihd.net/economy/image/"
    for item in live[:16]:
        icon = item.get("Item", {}).get("iconUrl")
        if icon:
            url = steam_prefix + icon + "/360fx360f"
            item["localImage"] = local_path(url)
            urls.add(url)
    for key in ("mainItems", "popular", "feature"):
        value = stats.get(key)
        records = value if isinstance(value, list) else []
        if isinstance(value, dict):
            records = [record for group in value.values() if isinstance(group, list) for record in group]
        for item in records[:20]:
            if isinstance(item, dict):
                icon = item.get("iconUrl") or item.get("Item", {}).get("iconUrl", "")
                if icon:
                    url = steam_prefix + icon + "/360fx360f"
                    item["localImage"] = local_path(url)
                    urls.add(url)

    # The avatar and blog cards are part of the landing page, not live API calls.
    for url in list(urls):
        if any(block in url for block in ("counter", "facebook.com/tr", "mail.ru")):
            urls.discard(url)
    urls = {
        url.split("#")[0]
        for url in urls
        if not url.startswith("data:")
        and not url.split("#")[0].endswith(".css")
        and not url.split("#")[0].endswith(".js")
        and "fonts.googleapis.com" not in url
    }

    results = []
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = [pool.submit(download, url) for url in sorted(urls)]
        for future in as_completed(futures):
            results.append(future.result())

    # A small, stable content snapshot powers the local animation and counters.
    DATA.mkdir(parents=True, exist_ok=True)
    fixture = {
        "statistics": {
            "totalTrust": stats.get("totalTrust"),
            "withdraws": stats.get("withdraws"),
            "totalTradeItems": stats.get("totalTradeItems"),
            "users": stats.get("users"),
            "lastReviews": [
                {"name": review.get("name") or review.get("User", {}).get("name"), "comment": review.get("comment"), "rating": review.get("rating")}
                for review in stats.get("lastReviews", [])[:12]
            ],
            "mainItems": {"cs": [
                {"name": item.get("name"), "quality": item.get("quality"), "steamPrice": item.get("steamPrice"), "localImage": item.get("localImage")}
                for item in stats.get("mainItems", {}).get("cs", [])[:7]
            ]},
        },
        "liveItems": [
            {"amount": item.get("amount"), "localImage": item.get("localImage"), "Item": {
                "name": item.get("Item", {}).get("name"),
                "quality": item.get("Item", {}).get("quality"),
                "backgroundColor": item.get("Item", {}).get("backgroundColor"),
            }}
            for item in live
        ],
    }
    # Keep the offline page usable when the source API temporarily returns an
    # empty LIVE feed or fewer reviews than the four rows shown on the page.
    previous_path = DATA / "snapshot.json"
    if previous_path.exists():
        previous = json.loads(previous_path.read_text(encoding="utf-8"))
        old_stats = previous.get("statistics", {})
        for key in ("totalTrust", "withdraws", "totalTradeItems", "users"):
            if fixture["statistics"][key] is None:
                fixture["statistics"][key] = old_stats.get(key)
        if not fixture["statistics"]["mainItems"]["cs"]:
            fixture["statistics"]["mainItems"]["cs"] = old_stats.get("mainItems", {}).get("cs", [])
        reviews = fixture["statistics"]["lastReviews"]
        existing_names = {review.get("name") for review in reviews}
        for review in old_stats.get("lastReviews", []):
            if len(reviews) >= 16:
                break
            if review.get("name") not in existing_names:
                reviews.append(review)
                existing_names.add(review.get("name"))
        if len(fixture["liveItems"]) < 16:
            fixture["liveItems"].extend(previous.get("liveItems", [])[:16 - len(fixture["liveItems"])])
    (DATA / "snapshot.json").write_text(json.dumps(fixture, ensure_ascii=False, indent=2), encoding="utf-8")
    mapping = {url: path for url, ok, path in results if ok}
    (DATA / "asset-map.json").write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8")
    failed = [(url, reason) for url, ok, reason in results if not ok]
    print(f"Downloaded {len(mapping)} assets; {len(failed)} failed")
    for url, reason in failed:
        print("FAILED", url, reason)


if __name__ == "__main__":
    main()
