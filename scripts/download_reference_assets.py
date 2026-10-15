"""Development-only capture of image/font responses used by the public home page."""

import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DATA = ROOT / "src" / "data"
mapping_path = DATA / "reference-assets.json"
mapping = json.loads(mapping_path.read_text(encoding="utf-8")) if mapping_path.exists() else {}
failures = []


def local_path(url, content_type):
    parsed = urlparse(url)
    if parsed.netloc == "avan.market":
        if parsed.path.startswith("/_next/static/media/"):
            return "/media/" + parsed.path.rsplit("/", 1)[-1]
        if parsed.path.startswith("/assets/") or parsed.path.startswith("/blog/"):
            return parsed.path
    extension = Path(parsed.path).suffix.lower()
    if extension not in (".svg", ".png", ".jpg", ".jpeg", ".webp", ".woff2", ".woff"):
        extension = ".jpg" if "jpeg" in content_type else ".png"
    digest = hashlib.sha1(url.encode()).hexdigest()[:16]
    return f"/reference/{parsed.netloc}/{digest}{extension}"


with sync_playwright() as playwright:
    chrome = Path("C:/Program Files/Google/Chrome/Application/chrome.exe")
    browser = playwright.chromium.launch(headless=True, **({"executable_path": str(chrome)} if chrome.exists() else {}))
    page = browser.new_page(viewport={"width": 1440, "height": 900})

    def save(request):
        if request.resource_type not in ("image", "font"):
            return
        try:
            response = request.response()
            if not response or response.status != 200:
                return
            content_type = response.headers.get("content-type", "")
            if not (content_type.startswith("image/") or "font" in content_type or "woff" in content_type):
                return
            path = local_path(request.url, content_type)
            target = PUBLIC / path.lstrip("/")
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(response.body())
            mapping[request.url] = path
        except Exception as exc:
            failures.append((request.url, str(exc)))

    page.on("requestfinished", save)
    page.goto("https://avan.market/ru", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(6000)
    page.keyboard.press("Escape")
    for position in range(0, 4400, 550):
        page.evaluate("(position) => window.scrollTo(0, position)", position)
        page.wait_for_timeout(600)
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(1000)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(1000)
    browser.close()

mapping_path.write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8")
print("Saved", len(mapping), "assets; failures", len(failures))
for url, reason in failures[:10]:
    print("FAILED", url, reason)
