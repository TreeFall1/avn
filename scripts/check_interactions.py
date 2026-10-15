"""Check the main local interactions in a production build."""

from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = "http://localhost:3000"
ROOT = Path(__file__).resolve().parents[1]
CHROME = Path("C:/Program Files/Google/Chrome/Application/chrome.exe")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        **({"executable_path": str(CHROME)} if CHROME.exists() else {}),
    )
    context = browser.new_context(viewport={"width": 390, "height": 900})
    page = context.new_page()
    page.goto(BASE, wait_until="networkidle")
    assert page.get_by_role("dialog").is_visible()
    page.screenshot(path=str(ROOT / ".next" / "local-final-modal.png"))
    page.keyboard.press("Escape")
    assert page.get_by_role("dialog").count() == 0
    assert page.evaluate("sessionStorage.getItem('avan-welcome-seen')") == "1"
    page.screenshot(path=str(ROOT / ".next" / "local-final-mobile.png"))

    broken = page.evaluate("() => [...document.images].filter(img => !img.complete || !img.naturalWidth).map(img => img.src)")
    assert not broken, broken

    page.evaluate("scrollTo(0, 850)")
    page.wait_for_timeout(200)
    assert abs(page.locator("header").bounding_box()["y"]) <= 1
    page.screenshot(path=str(ROOT / ".next" / "local-final-mobile-scroll.png"))

    page.locator('button[class*="chatBar"]').click()
    assert page.locator('div[class*="chatPanel"]').is_visible()
    page.locator('button[class*="chatFaq"]').click()
    assert page.locator('section[class*="faqSection"]').is_visible()
    faq = page.locator('div[class*="faqItem"] > button').first
    faq.click()
    assert faq.get_attribute("aria-expanded") == "true"
    faq.press("Enter")
    assert faq.get_attribute("aria-expanded") == "false"

    page.locator('button[class*="burger"]').click()
    assert page.locator('div[class*="mobileMenu"]').is_visible()
    page.locator('div[class*="mobileMenu"] a[href="/en"]').click()
    assert page.url.endswith("/en")
    page.wait_for_function("document.documentElement.lang === 'en'")
    assert page.locator("html").get_attribute("lang") == "en"
    context.close()

    desktop = browser.new_context(viewport={"width": 1440, "height": 900})
    desktop.add_init_script("sessionStorage.setItem('avan-welcome-seen', '1')")
    page = desktop.new_page()
    page.goto(BASE, wait_until="networkidle")
    page.locator('button[class*="headerSelect"]').last.click()
    page.locator('div[class*="dropdownMenu"] button').filter(has_text="USD").click()
    assert "$" in page.locator('div[class*="heroCardBottom"] strong').first.inner_text()
    page.locator('button[class*="headerSelect"]').first.click()
    page.locator('div[class*="dropdownMenu"] a[href="/en"]').click()
    assert page.url.endswith("/en")
    desktop.close()
    browser.close()

print("Modal, sticky header, FAQ, chat help, menu, currency, language, and images: OK")
