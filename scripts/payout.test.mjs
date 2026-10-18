import test from 'node:test';
import assert from 'node:assert/strict';
import { PAYOUT_METHODS, canSelectPayout, formatPayoutDate, getMinimumPayoutCents, validatePayoutFields } from '../src/lib/payout.mjs';

test('Payout date is one week from today in Moscow, including midnight and year boundaries', () => {
  assert.equal(formatPayoutDate(Date.parse('2026-10-18T12:00:00Z'), 'ru'), '25 октября');
  assert.equal(formatPayoutDate(Date.parse('2026-10-18T20:59:59Z'), 'ru'), '25 октября');
  assert.equal(formatPayoutDate(Date.parse('2026-10-18T21:00:00Z'), 'ru'), '26 октября');
  assert.equal(formatPayoutDate(Date.parse('2026-12-28T12:00:00Z'), 'en'), 'January 4');
  assert.equal(formatPayoutDate(Date.parse('2028-02-23T12:00:00Z'), 'en'), 'March 1');
});

test('Payout selection unlocks at 100 RUB, including equivalents in other currencies', () => {
  const rates = { USD: 1, RUB: 80, EUR: .92 };
  assert.equal(getMinimumPayoutCents('RUB'), 10000);
  assert.equal(getMinimumPayoutCents('USD', rates), 125);
  assert.equal(getMinimumPayoutCents('EUR', rates), 115);
  for (const currency of ['RUB', 'USD', 'EUR']) {
    const minimum = getMinimumPayoutCents(currency, rates);
    assert.equal(canSelectPayout(0, minimum), false);
    assert.equal(canSelectPayout(minimum - 1, minimum), false);
    assert.equal(canSelectPayout(minimum, minimum), true);
    assert.equal(canSelectPayout(minimum + 1, minimum), true);
  }
  for (const rates of [undefined, {}, { RUB: 0 }, { RUB: NaN }, { RUB: 80, EUR: -1 }]) {
    assert.equal(getMinimumPayoutCents('EUR', rates), null);
  }
  assert.equal(canSelectPayout(1_000_000, null), false);
  for (const total of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(canSelectPayout(total, 10000), false);
});

const wallets = {
  evm: '0x52908400098527886E0F7030069857D2E4169EE7',
  tron: 'T' + 'A'.repeat(33),
  btc: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
  ltc: 'L' + 'A'.repeat(33),
  sol: 'A'.repeat(44),
  ton: 'UQ' + 'A'.repeat(46),
};
const fields = {
  email: 'test@example.com', card: '4111 1111 1111 1111', fullName: 'Иван Иванов', phone: '+7 (999) 123-45-67',
  bank: 'Сбербанк', iban: 'DE89 3704 0044 0532 0130 00', steamProfile: 'https://steamcommunity.com/profiles/76561198060265728/',
};

test('Every method has a valid form and requires its own fields', () => {
  assert.equal(new Set(PAYOUT_METHODS.map(method => method.id)).size, 16);
  for (const method of PAYOUT_METHODS) {
    const values = { ...fields, wallet: wallets[method.address] };
    assert.deepEqual(validatePayoutFields(method.id, values), {}, method.id);
    for (const field of method.fields) {
      assert.equal(validatePayoutFields(method.id, { ...values, [field]: '  ' })[field], 'required', `${method.id}: ${field}`);
    }
    if (method.address) {
      assert.deepEqual(method.fields, ['email', 'wallet']);
      assert.equal(validatePayoutFields(method.id, { ...values, wallet: 'not-an-address' }).wallet, 'wallet');
    }
  }
});

test('Reject mistyped card checksums, IBANs, contact details, and fake Steam origins', () => {
  assert.equal(validatePayoutFields('card', { ...fields, card: '4111 1111 1111 1112' }).card, 'card');
  assert.equal(validatePayoutFields('card', { ...fields, card: '0000 0000 0000 0000' }).card, 'card');
  assert.equal(validatePayoutFields('bank', { ...fields, iban: fields.iban.replace('DE89', 'DE88') }).iban, 'iban');
  assert.equal(validatePayoutFields('paypal', { email: 'a@' }).email, 'email');
  assert.equal(validatePayoutFields('sbp', { ...fields, phone: '+7 123' }).phone, 'phone');
  assert.deepEqual(validatePayoutFields('sbp', { ...fields, phone: '8 (999) 123-45-67' }), {});
  assert.equal(validatePayoutFields('steam', { ...fields, steamProfile: 'https://steamcommunity.com.evil.test/id/example/' }).steamProfile, 'steamProfile');
  assert.deepEqual(validatePayoutFields('steam', { ...fields, steamProfile: 'https://steamcommunity.com/id/example/' }), {});
  assert.deepEqual(validatePayoutFields('missing', fields), { method: 'required' });
});
