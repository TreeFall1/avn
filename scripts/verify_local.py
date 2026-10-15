"""Production smoke checks for the offline landing page."""

import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
BASE = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("AVAN_BASE", "http://localhost:3000")


def inspect(page, route, width):
    external = []
    page.on("request", lambda request: external.append(request.url) if not request.url.startswith(BASE) else None)
    response = page.goto(BASE + route, wait_until="networkidle")
    page.wait_for_selector('div[class$="_liveCard"]')
    page.wait_for_timeout(300)
    result = page.evaluate("""() => {
      const cards = [...document.querySelectorAll('[class$="_reviewCard"]')].filter(card => getComputedStyle(card).display !== 'none');
      const creators = [...document.querySelectorAll('[class$="_creatorCard"]')];
      const live = [...document.querySelectorAll('div[class$="_liveCard"]')];
      const images = [...document.querySelectorAll('[class$="_reviewPerson"] img, [class$="_creatorCard"] img, div[class$="_liveCard"] img')];
      return {
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        reviewCount: cards.length,
        reviewRows: [...new Set(cards.map(card => Math.round(card.getBoundingClientRect().top)))].length,
        creatorCount: creators.length,
        liveCount: live.length,
        brokenImages: images.filter(img => !img.complete || img.naturalWidth === 0).map(img => img.src),
        reviewMore: [...document.querySelectorAll('button')].some(button => /^(Смотреть все отзывы|Show more reviews)$/.test(button.textContent.trim())),
        stats: [...document.querySelectorAll('[class*="statCard"] strong')].map(node => node.textContent),
        livePosition: getComputedStyle(document.querySelector('[class*="liveTrack"]')).transform,
      };
    }""")
    positions = [result.pop("livePosition")]
    for _ in range(22):
        page.wait_for_timeout(250)
        positions.append(page.locator('[class*="liveTrack"]').evaluate("el => getComputedStyle(el).transform"))
    result["liveSteps"] = len(set(positions)) > 1 and any(a == b for a, b in zip(positions, positions[1:]))
    result["status"] = response.status
    result["externalRequests"] = external
    result["route"] = route
    result["width"] = width
    return result


with sync_playwright() as playwright:
    chrome = Path("C:/Program Files/Google/Chrome/Application/chrome.exe")
    browser = playwright.chromium.launch(headless=True, **({"executable_path": str(chrome)} if chrome.exists() else {}))
    results = []
    for width, route in ((1440, "/"), (768, "/ru"), (390, "/en")):
        context = browser.new_context(viewport={"width": width, "height": 900}, reduced_motion="no-preference")
        context.add_init_script("sessionStorage.setItem('avan-welcome-seen', '1')")
        page = context.new_page()
        results.append(inspect(page, route, width))
        context.close()

    contexts = [browser.new_context(viewport={"width": 1440, "height": 900}) for _ in range(2)]
    contexts[0].add_init_script("sessionStorage.setItem('avan-welcome-seen', '1')")
    contexts[1].add_init_script("sessionStorage.setItem('avan-welcome-seen', '1'); Date.now = () => new Date('2031-01-01T00:00:00Z').getTime()")
    pages = [context.new_page() for context in contexts]
    for page in pages:
        page.goto(BASE, wait_until="networkidle")
    results.append({"clockSkewStats": [page.locator('[class*="statCard"] strong').all_text_contents() for page in pages]})
    for context in contexts:
        context.close()
    browser.close()

print(json.dumps(results, ensure_ascii=True, indent=2))
assert all(result["status"] == 200 and result["reviewCount"] == expected and result["reviewRows"] == 4 and result["creatorCount"] == 20 and result["liveCount"] == 48 and not result["brokenImages"] and not result["externalRequests"] and not result["horizontalOverflow"] and not result["reviewMore"] and result["liveSteps"] for result, expected in zip(results[:3], (16, 8, 4)))
assert results[3]["clockSkewStats"][0][:3] == results[3]["clockSkewStats"][1][:3]
