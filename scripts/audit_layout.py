"""Development-only DOM measurements and screenshots for visual comparison."""

import json
from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".next" / "reference"
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    chrome = Path("C:/Program Files/Google/Chrome/Application/chrome.exe")
    browser = playwright.chromium.launch(headless=True, **({"executable_path": str(chrome)} if chrome.exists() else {}))
    for site, url in (("source", "https://avan.market/ru"), ("local", "http://localhost:3000/")):
        for width in (1440, 390):
            page = browser.new_page(viewport={"width": width, "height": 900}, device_scale_factor=1)
            if site == "local":
                page.add_init_script("sessionStorage.setItem('avan-welcome-seen', '1')")
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(5000 if site == "source" else 700)
            if site == "source" and page.locator('button[class*="IconButton"][class*="round"]').count():
                page.locator('button[class*="IconButton"][class*="round"]').last.click()
            else:
                page.keyboard.press("Escape")
            page.wait_for_timeout(400)
            page.screenshot(path=str(OUT / f"{site}-full-{width}.png"), full_page=True)
            for y in (0, 850, 1700, 2550, 3400, 4250):
                page.evaluate("(position) => window.scrollTo(0, position)", y)
                page.wait_for_timeout(100)
                page.screenshot(path=str(OUT / f"{site}-{width}-{y}.png"))
            metrics = page.evaluate("""() => ({
              title: document.title,
              height: document.documentElement.scrollHeight,
              elements: [...document.querySelectorAll('h1,h2,h3,header,footer,section')]
                .map(el => ({ tag: el.tagName, class: el.className?.toString().slice(0,120), text: el.innerText?.replace(/\\s+/g,' ').slice(0,100), top: Math.round(el.getBoundingClientRect().top+scrollY), width: Math.round(el.getBoundingClientRect().width), height: Math.round(el.getBoundingClientRect().height) }))
                .filter(el => el.height > 0 && el.width > 0),
              images: [...document.images].map(img => ({src: img.currentSrc || img.src, alt: img.alt, width: Math.round(img.getBoundingClientRect().width), height: Math.round(img.getBoundingClientRect().height)})),
              css: [...document.querySelectorAll('link[rel=stylesheet]')].map(link => link.href)
            })""")
            (OUT / f"{site}-{width}.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
            if site == "source" and width == 1440:
                (OUT / "source.html").write_text(page.content(), encoding="utf-8")
            page.close()
    browser.close()
