"""Development-only screenshots for comparing the public site and the local copy."""

from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".next" / "reference"
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    chrome = Path("C:/Program Files/Google/Chrome/Application/chrome.exe")
    browser = playwright.chromium.launch(headless=True, **({"executable_path": str(chrome)} if chrome.exists() else {}))
    for width in (1440, 768, 390):
        page = browser.new_page(viewport={"width": width, "height": 900}, device_scale_factor=1)
        response = page.goto("https://avan.market/ru", wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(10000)
        summary = page.locator("body").inner_text()[:200].replace("\n", " ")
        print(width, response.status if response else None, page.url, page.title(), summary.encode("ascii", "backslashreplace").decode())
        page.screenshot(path=str(OUT / f"source-modal-{width}.png"), full_page=True)
        page.keyboard.press("Escape")
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / f"source-clear-{width}.png"), full_page=True)
        sections = page.evaluate("""() => [...document.querySelectorAll('main > *, h1, h2')].map(el => ({tag: el.tagName, text: el.innerText?.slice(0,80), top: Math.round(el.getBoundingClientRect().top + scrollY), height: Math.round(el.getBoundingClientRect().height)})).filter(x => x.height > 0)""")
        print(sections)
        page.close()
    browser.close()
