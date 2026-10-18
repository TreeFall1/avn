"""Check payout forms, the 100 RUB minimum, and fee labels without deductions.

Run: python scripts/check_payouts.py http://localhost:3000
Inventory responses are intercepted only in this browser.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'screenshots' / 'payouts'
OUTPUT.mkdir(parents=True, exist_ok=True)
TRADE_URL = 'https://steamcommunity.com/tradeoffer/new/?partner=100000000&token=AbcD-123'
IMAGE = json.loads((ROOT / 'src/data/reference-content.json').read_text(encoding='utf-8'))['inventory'][0]
METHODS = ['card', 'sbp', 'bank', 'paypal', 'usdt-trc20', 'usdt-bep20', 'bnb', 'usdt-erc20', 'btc', 'eth', 'tron', 'ltc', 'sol', 'gram', 'steam', 'balance']
WALLETS = {
    'usdt-trc20': 'T' + 'A' * 33, 'tron': 'T' + 'A' * 33,
    'usdt-bep20': '0x' + 'a' * 40, 'bnb': '0x' + 'a' * 40,
    'usdt-erc20': '0x' + 'a' * 40, 'eth': '0x' + 'a' * 40,
    'btc': '1BoatSLRHtKNngkdXEeobR76b53LETtpyT', 'ltc': 'L' + 'A' * 33,
    'sol': 'A' * 44, 'gram': 'UQ' + 'A' * 46,
}


def inventory_fixture(body, overrides):
    total = overrides.get('total', 88298 if body['currency'] == 'EUR' else 9167295)
    minimum = {'RUB': 10000, 'USD': 125, 'EUR': 115}[body['currency']]
    items = [{
        'id': str(i), 'name': f'Test skin {i}', 'quantity': 1, 'condition': 'FN',
        'rarityColor': '#eb4b4b', 'image': IMAGE, 'tradable': True, 'priceCents': amount,
    } for i, amount in enumerate([total] if 'total' in overrides else [50000, total - 50000], 1)]
    return {
        'steamId64': body['steamId64'], 'appId': body['appId'], 'currency': body['currency'], 'items': items,
        'summary': {'itemCount': 2, 'pricedCount': 2, 'unpricedCount': 0, 'totalCents': total},
        'pricing': {'source': 'skinport', 'updatedAt': '2026-10-18T10:00:00.000Z'}, 'warnings': [],
        'minimumPayoutCents': overrides.get('minimum', minimum),
    }


def check_trade_screen(page, section, form, locale, width, method):
    trade = page.locator('[data-trade-confirmation]')
    expected_amount = section.locator('[data-inventory-total]').text_content()
    expect(trade).to_be_visible()
    expect(section).to_be_hidden()
    expect(trade.locator('[data-trade-amount]')).to_have_text(expected_amount)
    expect(trade.locator('[data-trade-payout-date]')).to_have_text('25 октября' if locale == 'ru' else 'October 25')
    expect(trade.locator('ol li')).to_have_count(3)
    expect(trade.locator('li[aria-current=step]')).to_have_count(1)
    expect(trade.locator('h1')).to_be_focused()
    expect(trade.get_by_role('button', name='Подтвердить обмен' if locale == 'ru' else 'Confirm trade', exact=True)).to_be_disabled()
    assert trade.locator('dl dd').all_text_contents()[1:] == ['—'] * 4
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    if method in ['sbp', 'bank', 'btc']:
        trade.screenshot(path=str(OUTPUT / f'trade-{method}-{width}.png'))
        if method == 'sbp':
            page.screenshot(path=str(OUTPUT / f'trade-page-{width}.png'), full_page=True)
    trade.get_by_role('button', name='Вернуться к реквизитам' if locale == 'ru' else 'Back to payout details', exact=False).click()
    expect(trade).to_have_count(0)
    expect(section).to_be_visible()
    expect(form).to_be_visible()
    expect(form.locator('input[name=email]')).to_have_value('payout-test@example.com')


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
    for width, locale in [(1440, 'ru'), (768, 'ru'), (390, 'en')]:
        context = browser.new_context(viewport={'width': width, 'height': 1050}, reduced_motion='reduce')
        context.add_init_script("sessionStorage.setItem('avan-welcome-seen', '1')")
        page = context.new_page()
        errors, posts = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: posts.append(request.url) if request.method == 'POST' else None)
        overrides = {}
        page.route('**/api/inventory', lambda route: route.fulfill(json=inventory_fixture(route.request.post_data_json, overrides)))
        page.route('**/api/time', lambda route: route.fulfill(json={'now': 1792324800000}))
        page.goto(BASE + ('/en' if locale == 'en' else '/'), wait_until='networkidle')
        section = page.locator('#inventory')
        payout = section.locator('aside')
        method_buttons = payout.locator('[data-payout-method]')
        expect(method_buttons).to_have_count(16)
        first = method_buttons.first
        first.hover()
        expect(first.get_by_role('tooltip')).to_have_text('1% fee' if locale == 'en' else 'Комиссия 1%')
        expect(first.get_by_role('tooltip')).to_be_visible()
        form = payout.locator('form')
        assert method_buttons.evaluate_all('els => els.every(el => el.disabled)')
        first.evaluate('el => el.click()')
        expect(form).to_have_count(0)
        expect(payout.locator('#payout-minimum')).to_be_visible()
        trade = section.get_by_label('Trade URL', exact=True)
        trade.fill(TRADE_URL)
        trade.press('Enter')
        expect(section.locator('button[class*="_item"][aria-pressed]')).to_have_count(2)

        for method in METHODS:
            button = payout.locator(f'[data-payout-method="{method}"]')
            button.focus()
            expect(button.get_by_role('tooltip')).to_be_visible()
            button.click()
            expect(form).to_be_visible()
            expect(form.locator('div[class*=date]')).to_contain_text('25 октября' if locale == 'ru' else 'October 25')
            email = form.locator('input[name=email]')
            expect(email).to_be_focused()
            receive = form.locator('button[type=submit]')
            expect(receive).to_be_enabled()
            receive.click()
            expect(page.locator('[data-trade-confirmation]')).to_have_count(0)
            expect(email).to_have_attribute('aria-invalid', 'true')
            email.fill('bad-email')
            receive.click()
            expect(email).to_have_attribute('aria-invalid', 'true')
            email.fill('payout-test@example.com')
            if method == 'card':
                form.locator('input[name=card]').fill('4111111111111111')
                expect(form.locator('input[name=card]')).to_have_value('4111 1111 1111 1111')
                form.locator('input[name=fullName]').fill('Иван Иванов')
            elif method == 'sbp':
                form.locator('input[name=phone]').fill('+7 (999) 123-45-67')
                form.locator('select[name=bank]').select_option('other')
                receive.click()
                expect(form.locator('input[name=otherBank]')).to_have_attribute('aria-invalid', 'true')
                form.locator('input[name=otherBank]').fill('Тестовый банк')
                form.locator('select[name=bank]').select_option('Сбербанк')
            elif method == 'bank':
                form.locator('input[name=iban]').fill('DE89370400440532013000')
                form.locator('input[name=fullName]').fill('Ivan Ivanov')
            elif method in WALLETS:
                expect(form.locator('input')).to_have_count(2)
                wallet = form.locator('input[name=wallet]')
                wallet.fill('invalid')
                receive.click()
                expect(wallet).to_have_attribute('aria-invalid', 'true')
                wallet.fill(WALLETS[method])
            elif method == 'steam':
                expect(form.locator('input[name=steamProfile]')).to_have_value('https://steamcommunity.com/profiles/76561198060265728/')
            expect(form.locator('[data-payout-amount]')).to_have_text(section.locator('[data-inventory-total]').inner_text())
            expect(form.locator('[data-payout-fee]')).to_have_count(0)
            expect(form.locator('p[class*=commission]')).to_have_text('1% fee' if locale == 'en' else 'Комиссия 1%')
            receive.click()
            check_trade_screen(page, section, form, locale, width, method)
            assert form.locator('[aria-invalid=true]').count() == 0
            if method in ['sbp', 'bank', 'btc']:
                payout.screenshot(path=str(OUTPUT / f'{method}-{width}.png'))
            if method == 'card':
                cards = section.locator('button[class*="_item"][aria-pressed]')
                cards.first.click()
                expect(form.get_by_role('status')).to_have_count(0)
                expect(form.locator('[data-payout-amount]')).to_have_text(section.locator('[data-inventory-total]').inner_text())
                cards.nth(1).click()
                expect(form).to_have_count(0)
                assert method_buttons.evaluate_all('els => els.every(el => el.disabled)')
                cards.first.click()
                cards.nth(1).click()
            form.locator('button[type=button]').click()
            expect(method_buttons).to_have_count(16)
            if method == 'card':
                payout.locator('[data-payout-method=card]').click()
                expect(form.locator('input[name=card]')).to_have_value('4111 1111 1111 1111')
                expect(form.get_by_role('status')).to_have_count(0)
                form.locator('button[type=button]').click()

        minimum = 10000 if locale == 'ru' else 125
        refresh = section.get_by_role('button', name='Обновить инвентарь' if locale == 'ru' else 'Refresh inventory', exact=True)
        overrides['total'] = minimum - 1
        refresh.click()
        expect(section.locator('button[class*="_item"][aria-pressed]')).to_have_count(1)
        expect(method_buttons.first).to_be_disabled()
        assert method_buttons.evaluate_all('els => els.every(el => el.disabled)')
        method_buttons.first.evaluate('el => el.click()')
        expect(form).to_have_count(0)
        payout.screenshot(path=str(OUTPUT / f'minimum-locked-{width}.png'))
        overrides['total'] = minimum
        refresh.click()
        expect(method_buttons.first).to_be_enabled()
        method_buttons.first.click()
        expect(form).to_be_visible()
        expect(form.locator('[data-payout-amount]')).to_have_text(section.locator('[data-inventory-total]').inner_text())
        cards = section.locator('button[class*="_item"][aria-pressed]')
        cards.first.click()
        expect(form).to_have_count(0)
        assert method_buttons.evaluate_all('els => els.every(el => el.disabled)')
        cards.first.click()
        expect(form).to_be_visible()
        form.locator('button[type=button]').click()
        overrides.clear()
        refresh.click()
        expect(section.locator('button[class*="_item"][aria-pressed]')).to_have_count(2)
        expect(method_buttons.first).to_be_enabled()

        if width == 1440:
            payout.locator('[data-payout-method=bank]').click()
            page.locator('button[class*="headerSelect"]').last.click()
            page.get_by_role('button', name='€ EUR', exact=True).click()
            expect(form.locator('[data-payout-amount]')).to_contain_text('882,98')
            expect(form.locator('[data-payout-fee]')).to_have_count(0)
            expect(form.get_by_role('status')).to_have_count(0)
            form.locator('button[type=submit]').click()
            check_trade_screen(page, section, form, locale, width, 'bank')
            payout.screenshot(path=str(OUTPUT / 'bank-eur-1440.png'))
            overrides['minimum'] = None
            refresh.click()
            expect(form).to_have_count(0)
            assert method_buttons.evaluate_all('els => els.every(el => el.disabled)')

        assert not errors, errors
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        assert all(url.endswith('/api/inventory') for url in posts), posts
        assert not page.evaluate("JSON.stringify([localStorage,sessionStorage]).includes('payout-test@example.com')")
        assert not any(text in payout.inner_text().lower() for text in ['промокод', 'promo code', 'как получить быстрее', 'ввести вручную', 'об оценке инвентаря', 'about the inventory valuation', 'с вычетом комиссии', 'after a 1% fee'])
        assert not payout.locator('img').evaluate_all('els=>els.some(img=>!img.complete||!img.naturalWidth)')
        print(f'{width}px {locale}: all 16 methods, tooltips, fields, validation, selection, 100 RUB minimum, +7 day payout date, trade confirmation, return navigation and privacy OK')
        context.close()
    browser.close()
