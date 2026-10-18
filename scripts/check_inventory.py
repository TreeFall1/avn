"""Exercise the real inventory UI with deterministic API fixtures.

Run against a running build: python scripts/check_inventory.py http://localhost:3000
Fixtures intercept only this browser's requests; production never uses them.
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'screenshots' / 'inventory'
OUTPUT.mkdir(parents=True, exist_ok=True)
TRADE_URL = 'https://steamcommunity.com/tradeoffer/new/?partner=100000000&token=AbcD-123'
IMAGES = json.loads((ROOT / 'src/data/reference-content.json').read_text(encoding='utf-8'))['inventory']


def fixture(body):
    currency = body['currency']
    multiplier = 80 if currency == 'RUB' else 1
    items = [
        {'id': '1', 'name': 'AK-47 | Redline (Field-Tested)', 'quantity': 2, 'condition': 'FT', 'rarityColor': '#eb4b4b', 'image': IMAGES[0], 'tradable': True, 'priceCents': 20000 * multiplier},
        {'id': '2', 'name': 'AWP | Asiimov (Minimal Wear)', 'quantity': 1, 'condition': 'MW', 'rarityColor': '#d32ce6', 'image': IMAGES[1], 'tradable': True, 'priceCents': 5000 * multiplier},
        {'id': '3', 'name': 'Unknown collectible', 'quantity': 1, 'condition': '', 'rarityColor': '#8993a4', 'image': IMAGES[2], 'tradable': False, 'priceCents': None},
    ] if body['appId'] != 570 else []
    return {
        'steamId64': body['steamId64'], 'appId': body['appId'], 'currency': currency, 'items': items,
        'summary': {'itemCount': 4 if items else 0, 'pricedCount': 3 if items else 0, 'unpricedCount': 1 if items else 0, 'totalCents': 25000 * multiplier if items else 0},
        'pricing': {'source': 'skinport', 'updatedAt': '2026-10-15T08:00:00.000Z'},
        'warnings': [], 'exchangeRateProvider': 'https://www.exchangerate-api.com' if currency == 'RUB' else None,
    }


with sync_playwright() as playwright:
    chrome = Path('C:/Program Files/Google/Chrome/Application/chrome.exe')
    browser = playwright.chromium.launch(headless=True, **({'executable_path': str(chrome)} if chrome.exists() else {}))
    for width, language in [(1440, 'ru'), (768, 'ru'), (390, 'en')]:
        context = browser.new_context(viewport={'width': width, 'height': 1000}, reduced_motion='reduce')
        context.add_init_script("sessionStorage.setItem('avan-welcome-seen', '1')")
        page = context.new_page()
        requests = []
        errors = []
        state = {'private': False, 'large': False, 'archive': False}
        page.on('pageerror', lambda error: errors.append(str(error)))

        def respond(route):
            body = route.request.post_data_json
            requests.append(body)
            assert set(body) == {'steamId64', 'appId', 'currency'}
            assert body['steamId64'] == '76561198060265728'
            if state['private']:
                route.fulfill(status=403, json={'error': {'code': 'PRIVATE_INVENTORY'}})
            else:
                data = fixture(body)
                if state['large']:
                    data['items'] = [{**data['items'][0], 'id': str(index), 'name': f'Case {index}', 'quantity': 1, 'priceCents': 100} for index in range(250)]
                    data['summary'] = {'itemCount': 250, 'pricedCount': 250, 'unpricedCount': 0, 'totalCents': 25000}
                if state['archive']:
                    data['pricing'] = {'source': 'archive', 'updatedAt': '2025-12-15T19:35:13.000Z'}
                    data['warnings'] = ['ARCHIVE_PRICES']
                route.fulfill(json=data)

        page.route('**/api/inventory', respond)
        page.goto(BASE + ('/en' if language == 'en' else '/'), wait_until='networkidle')
        section = page.locator('#inventory')
        section.scroll_into_view_if_needed()
        section.screenshot(path=str(OUTPUT / f'initial-{width}.png'))
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        url = section.get_by_label('Trade URL', exact=True)
        url.fill('https://steamcommunity.com.evil.example/tradeoffer/new/?partner=100000000&token=AbcD-123')
        url.press('Enter')
        expect(url).to_have_attribute('aria-invalid', 'true')
        assert len(requests) == 0
        url.fill(TRADE_URL)
        state['private'] = True
        url.press('Enter')
        expect(section.get_by_role('alert')).to_contain_text('private' if language == 'en' else 'закрыт')
        section.screenshot(path=str(OUTPUT / f'private-{width}.png'))
        state['private'] = False
        url.press('Enter')
        cards = section.locator('button[class*="_item"][aria-pressed]')
        expect(cards).to_have_count(3)
        expect(cards.nth(2)).to_be_disabled()
        total = section.locator('[data-inventory-total]')
        expect(total).to_contain_text('250.00' if language == 'en' else '20\u00a0000')
        section.screenshot(path=str(OUTPUT / f'loaded-{width}.png'))
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        cards.first.click()
        expect(total).to_contain_text('50.00' if language == 'en' else '4\u00a0000')
        search = section.get_by_role('textbox', name='Find item' if language == 'en' else 'Найти предмет')
        # Keep the current source's label rather than assuming its English wording.
        if search.count() == 0:
            search = section.locator('input').first
        search.fill('AK-47')
        expect(cards).to_have_count(1)
        section.locator('button[class*="_selectAll"]').click()
        expect(total).to_contain_text('250.00' if language == 'en' else '20\u00a0000')
        search.fill('no-such-skin')
        expect(cards).to_have_count(0)
        section.get_by_role('button', name='Clear search' if language == 'en' else 'Сбросить поиск').click()
        section.get_by_label('Sort by' if language == 'en' else 'Сортировка', exact=True).select_option('price-asc')
        expect(cards.first).to_contain_text('AWP')
        section.get_by_role('button', name='Clear selection' if language == 'en' else 'Снять выбор', exact=True).click()
        expect(total).to_contain_text('0.00' if language == 'en' else '0,00')
        section.get_by_role('button', name='Dota 2', exact=True).click()
        expect(section.get_by_role('heading', name='Your inventory for this game is empty' if language == 'en' else 'В этой игре инвентарь пуст')).to_be_visible()
        section.get_by_role('button', name='CS2', exact=True).click()
        expect(cards).to_have_count(3)
        section.get_by_role('button', name='Change Trade URL' if language == 'en' else 'Изменить Trade URL').click()
        expect(url).to_be_visible()
        section.get_by_role('button', name='Cancel' if language == 'en' else 'Отмена', exact=True).click()
        expect(cards).to_have_count(3)
        if width == 1440:
            page.locator('button[class*="headerSelect"]').last.click()
            page.get_by_role('button', name='$ USD', exact=True).click()
            expect(section.locator('[data-inventory-total]')).to_contain_text('$')
            assert requests[-1]['currency'] == 'USD'
            state['large'] = True
            state['archive'] = True
            section.get_by_role('button', name='Обновить инвентарь', exact=True).click()
            expect(cards).to_have_count(100)
            expect(section.locator('p[class*="_warning"]')).to_contain_text('15.12.2025')
            more = section.get_by_role('button', name='Показать ещё', exact=False)
            more.click()
            expect(cards).to_have_count(200)
            more.click()
            expect(cards).to_have_count(250)
            assert more.count() == 0
            expect(section.locator('aside details')).to_have_count(0)
            scroll = section.locator('div[class*="_itemScroll"]')
            assert scroll.evaluate('(el) => el.scrollHeight > el.clientHeight')
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        assert not errors, errors
        print(f'{width}px {language}: form, errors, cards, totals, selection, search, sort, games, editing, layout OK')
        context.close()

    # Validate the actual HTTP boundary without mocking the server.
    client = playwright.request.new_context(base_url=BASE)
    for body in [{}, {'steamId64': 'bad'}, {'steamId64': '76561198060265728', 'appId': 999}, {'steamId64': '76561198060265728', 'currency': 'BAD'}]:
        response = client.post('/api/inventory', data=body)
        assert response.status == 400, (response.status, response.text())
        assert response.headers['cache-control'] == 'no-store'
    assert client.post('/api/inventory', data='not json').status == 400
    assert client.post('/api/inventory', data='x' * 1025).status == 413
    client.dispose()
    browser.close()
print('HTTP validation and token privacy: OK')
