"""Inspect the public page's visible motion and LIVE card updates."""

import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / ".next" / "motion"
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe")
    for width in (1440, 390):
        page = browser.new_page(viewport={"width": width, "height": 900})
        page.goto("https://avan.market/", wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(4500)
        close = page.locator('button[class*="IconButton"][class*="round"]')
        if close.count():
            close.last.click()
        page.wait_for_timeout(1000)
        page.evaluate("document.documentElement.style.scrollBehavior='auto'; scrollTo(0, 0)")
        animations = page.evaluate("""() => document.getAnimations().map(a => ({name:a.animationName||a.effect?.getKeyframes()?.[0]?.easing, duration:a.effect?.getTiming()?.duration, target:a.effect?.target?.className?.toString().slice(0,120)})).filter(x=>x.target)""")
        print(width, "animations", json.dumps(animations[:80], ensure_ascii=False))
        for time in (0, 2500, 5000, 9000):
            if time:
                page.wait_for_timeout(time - (0 if time == 2500 else {5000:2500, 9000:5000}[time]))
            hero = page.evaluate("""() => ({title:document.querySelector('h1')?.innerText, cards:[...document.querySelectorAll('[class*="CardForMainPage"]')].filter(x=>x.tagName==='A').slice(0,6).map(x=>({text:x.innerText.slice(0,50),box:x.getBoundingClientRect().toJSON(),transform:getComputedStyle(x).transform}))})""")
            print(width, "hero", time, json.dumps(hero, ensure_ascii=False)[:1800])
        live_heading = page.locator('text=Последние сделки').first
        live_heading.scroll_into_view_if_needed()
        page.wait_for_timeout(500)
        live_section = live_heading.evaluate("e=>e.parentElement.parentElement.parentElement.outerHTML.slice(0,9000)")
        (OUT / f"source-live-{width}.html").write_text(live_section or "", encoding="utf-8")
        for i in range(6):
            state = live_heading.evaluate("""e => {let n=e.parentElement.parentElement.parentElement;return {html:n.innerText.slice(0,550), items:[...n.querySelectorAll('img')].map(x=>({src:x.currentSrc,box:Math.round(x.getBoundingClientRect().x)})).slice(0,14), animations:n.getAnimations({subtree:true}).map(a=>({name:a.animationName,duration:a.effect?.getTiming()?.duration,target:a.effect?.target?.className?.toString().slice(0,70)}))}}""")
            print(width, "live", i, json.dumps(state, ensure_ascii=False)[:4000])
            page.screenshot(path=str(OUT / f"source-live-{width}-{i}.png"))
            page.wait_for_timeout(2000)
        page.close()
    browser.close()
