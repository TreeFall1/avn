import test from 'node:test';
import assert from 'node:assert/strict';
import { steamIdFromTradeUrl, normalizeInventory, summarizeInventory } from '../src/lib/inventory.mjs';
import { createInventoryService } from '../src/lib/server/inventory.mjs';
import { createInventoryHandler } from '../src/lib/server/inventory-handler.mjs';
import { createSharedInventoryCache } from '../src/lib/server/inventory-cache.mjs';
import { retryAfterSeconds } from '../src/lib/retry.mjs';
import archivedPrices from '../src/data/inventory-prices.json' with { type: 'json' };

const steamId64 = '76561198060265728';
const tradeUrl = 'https://steamcommunity.com/tradeoffer/new/?partner=100000000&token=AbcD-123';
const asset = (id, classid = '100', amount = '1') => ({ assetid: id, classid, instanceid: '0', amount });
const description = (classid, name, options = {}) => ({
  classid, instanceid: '0', market_hash_name: name, icon_url: 'safe_icon-123', tradable: 1, marketable: 1,
  tags: [{ category: 'Rarity', color: 'eb4b4b' }, { category: 'Exterior', localized_tag_name: 'Field-Tested' }], ...options,
});
const weapon = description('100', 'AK-47 | Redline (Field-Tested)');
const prices = [{ market_hash_name: weapon.market_hash_name, currency: 'USD', mean_price: 12.34, suggested_price: 10 }];
const ok = data => Response.json(data);
const fullInventory = () => ({ success: 1, total_inventory_count: 1, assets: [asset('1')], descriptions: [weapon] });

test('Trade URL validation uses exact Steam origin and BigInt bounds', () => {
  assert.equal(steamIdFromTradeUrl(tradeUrl), steamId64);
  assert.equal(steamIdFromTradeUrl(`  ${tradeUrl}  `), steamId64);
  for (const value of [
    tradeUrl.replace('steamcommunity.com', 'steamcommunity.com.evil.example'),
    tradeUrl.replace('https:', 'http:'), tradeUrl.replace('/tradeoffer/new/', '/other/'),
    tradeUrl.replace('100000000', '4294967296'), tradeUrl.replace('100000000', '0'),
    `${tradeUrl}&partner=1`, tradeUrl.replace('&token=AbcD-123', ''), 'javascript:alert(1)',
  ]) assert.equal(steamIdFromTradeUrl(value), null, value);
});

test('Normalization joins class and instance, counts stacks and preserves unpriced items', () => {
  const items = normalizeInventory(
    [asset('1', '100', '3'), asset('2', '200'), asset('3', '300')],
    [weapon, description('200', 'No price'), description('300', 'Free', { tradable: 0, icon_url: '../bad?url' })],
    new Map([[weapon.market_hash_name, 12.34], ['Free', 0]]), 2,
  );
  assert.equal(items[0].priceCents, 7404);
  assert.equal(items[0].condition, 'FT');
  assert.equal(items[0].rarityColor, '#eb4b4b');
  assert.equal(items[1].priceCents, null);
  assert.equal(items[2].priceCents, 0);
  assert.equal(items[2].tradable, false);
  assert.equal(items[2].image, null);
  assert.deepEqual(summarizeInventory(items), { totalCents: 7404, itemCount: 5, pricedCount: 4, unpricedCount: 1 });
});

test('Pagination loads every page, deduplicates assets and coalesces requests', async () => {
  const calls = [];
  const evaluate = createInventoryService({ fetcher: async input => {
    const url = new URL(input);
    calls.push(url);
    if (url.hostname === 'api.skinport.com') return ok(prices);
    if (url.hostname === 'open.er-api.com') return ok({ result: 'success', base_code: 'USD', rates: { USD: 1, RUB: 80 } });
    return ok(url.searchParams.has('start_assetid') ? {
      success: 1, assets: [asset('1'), asset('2', '100', '2')], descriptions: [weapon],
    } : { ...fullInventory(), more_items: 1, last_assetid: '1' });
  } });
  const [a, b] = await Promise.all([
    evaluate({ steamId64, currency: 'RUB' }), evaluate({ steamId64, currency: 'RUB' }),
  ]);
  assert.equal(a.items.length, 2);
  assert.equal(a.summary.itemCount, 3);
  assert.equal(a.summary.totalCents, 296160);
  assert.equal(a.minimumPayoutCents, 10000);
  assert.deepEqual(a, b);
  assert.equal(calls.filter(url => url.hostname === 'steamcommunity.com').length, 2);
  assert.equal(calls.filter(url => url.hostname === 'api.skinport.com').length, 1);
  const usd = await evaluate({ steamId64, currency: 'USD' });
  assert.equal(usd.minimumPayoutCents, 125);
  assert.equal(calls.length, 4);
  assert.equal(calls[1].searchParams.get('start_assetid'), '1');
});

test('Bad IDs, games and currencies never reach upstream services', async () => {
  let calls = 0;
  const evaluate = createInventoryService({ fetcher: async () => { calls++; throw new Error(); } });
  for (const params of [{ steamId64: 'bad' }, { steamId64, appId: 123 }, { steamId64, currency: 'FAKE' }]) {
    await assert.rejects(evaluate(params), error => error.status === 400);
  }
  assert.equal(calls, 0);
});

test('Private inventory and Steam rate limiting produce actionable errors', async () => {
  for (const [status, code] of [[403, 'PRIVATE_INVENTORY'], [429, 'STEAM_RATE_LIMIT'], [404, 'INVENTORY_NOT_FOUND']]) {
    const evaluate = createInventoryService({ fetcher: async () => new Response('', { status }) });
    await assert.rejects(evaluate({ steamId64 }), error => error.code === code && error.status === status);
  }
});

test('Empty inventory is a success and does not request prices', async () => {
  const evaluate = createInventoryService({ fetcher: async input => {
    assert.equal(new URL(input).hostname, 'steamcommunity.com');
    return ok({ success: 1, total_inventory_count: 0 });
  } });
  const result = await evaluate({ steamId64, currency: 'USD' });
  assert.deepEqual(result.items, []);
  assert.equal(result.summary.totalCents, 0);
});

test('Broken pagination fails instead of reporting a misleading partial total', async () => {
  const evaluate = createInventoryService({ fetcher: async () => ok({ ...fullInventory(), more_items: 1, last_assetid: '1' }) });
  await assert.rejects(evaluate({ steamId64 }), error => error.code === 'INCOMPLETE_INVENTORY');
});

test('Price outage explicitly identifies archive date; other games retain unpriced items', async () => {
  const evaluate = createInventoryService({ fetcher: async input => {
    if (new URL(input).hostname === 'steamcommunity.com') return ok(fullInventory());
    return new Response('', { status: 503 });
  } });
  const cs = await evaluate({ steamId64, currency: 'USD' });
  assert.equal(cs.pricing.source, 'archive');
  assert.equal(cs.pricing.updatedAt, archivedPrices.updatedAt);
  assert.ok(cs.warnings.includes('ARCHIVE_PRICES'));
  assert.ok(cs.items[0].priceCents > 0);
  const dota = await evaluate({ steamId64, appId: 570, currency: 'USD' });
  assert.equal(dota.pricing.source, 'unavailable');
  assert.equal(dota.items[0].priceCents, null);
  assert.equal(dota.summary.unpricedCount, 1);
});

test('Expired live prices fall back to the last successful cache with a warning', async () => {
  let time = Date.UTC(2026, 9, 15);
  let failed = false;
  const evaluate = createInventoryService({ now: () => time, fetcher: async input => {
    if (new URL(input).hostname === 'steamcommunity.com') return ok(fullInventory());
    return failed ? new Response('', { status: 503 }) : ok(prices);
  } });
  const first = await evaluate({ steamId64, currency: 'USD' });
  time += 301_000;
  failed = true;
  const second = await evaluate({ steamId64, currency: 'USD' });
  assert.equal(second.pricing.source, 'cached');
  assert.equal(second.pricing.updatedAt, first.pricing.updatedAt);
  assert.equal(second.summary.totalCents, first.summary.totalCents);
  assert.ok(second.warnings.includes('CACHED_PRICES'));
});

test('Missing exchange rates returns actual USD amounts with explicit currency fallback', async () => {
  const evaluate = createInventoryService({ fetcher: async input => {
    const hostname = new URL(input).hostname;
    if (hostname === 'steamcommunity.com') return ok(fullInventory());
    if (hostname === 'api.skinport.com') return ok(prices);
    return new Response('', { status: 503 });
  } });
  const result = await evaluate({ steamId64, currency: 'RUB' });
  assert.equal(result.currency, 'USD');
  assert.equal(result.summary.totalCents, 1234);
  assert.equal(result.minimumPayoutCents, null);
  assert.ok(result.warnings.includes('CURRENCY_FALLBACK'));
});

test('Null upstream JSON is reported as a service failure', async () => {
  const evaluate = createInventoryService({ fetcher: async () => ok(null) });
  await assert.rejects(evaluate({ steamId64 }), error => error.code === 'STEAM_UNAVAILABLE');
});

test('Retry-After accepts seconds and HTTP dates, and rejects malformed values', () => {
  const now = Date.UTC(2026, 9, 18, 12);
  assert.equal(retryAfterSeconds('180', now), 180);
  assert.equal(retryAfterSeconds(new Date(now + 120000).toUTCString(), now), 120);
  assert.equal(retryAfterSeconds(new Date(now - 120000).toUTCString(), now), 1);
  for (const value of [null, '', '-5', 'later']) assert.equal(retryAfterSeconds(value, now), 60);
});

test('Steam 429 opens a cooldown across profiles and games; missing Retry-After backs off', async () => {
  let time = Date.UTC(2026, 9, 18);
  let calls = 0;
  const evaluate = createInventoryService({ now: () => time, fetcher: async () => { calls++; return new Response('', { status: 429 }); } });
  await assert.rejects(evaluate({ steamId64 }), error => error.retryAt === time + 60000);
  await assert.rejects(evaluate({ steamId64, appId: 570 }), error => error.code === 'STEAM_RATE_LIMIT');
  await assert.rejects(evaluate({ steamId64: '76561198060265729' }), error => error.code === 'STEAM_RATE_LIMIT');
  assert.equal(calls, 1);
  time += 60000;
  await assert.rejects(evaluate({ steamId64 }), error => error.retryAt === time + 120000);
  assert.equal(calls, 2);
});

function memorySharedCache(now) {
  const entries = new Map();
  let counter = 0;
  const read = key => {
    const entry = entries.get(key);
    return entry && entry.expires > now() ? structuredClone(entry.value) : null;
  };
  return {
    async get(key) { return read(key); },
    async set(key, value, ttl) { entries.set(key, { value: structuredClone(value), expires: now() + ttl }); },
    async acquire(key, ttl) {
      if (read(key)) return null;
      const owner = `owner-${++counter}`;
      entries.set(key, { value: owner, expires: now() + ttl });
      return owner;
    },
    async release(key, owner) { if (read(key) === owner) entries.delete(key); },
  };
}

test('Separate function instances share fresh inventories and serialize Steam loads', async () => {
  let time = Date.UTC(2026, 9, 18);
  const sharedCache = memorySharedCache(() => time);
  let calls = 0;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const fetcher = async input => {
    const host = new URL(input).hostname;
    if (host === 'steamcommunity.com') { calls++; await pending; return ok(fullInventory()); }
    if (host === 'api.skinport.com') return ok(prices);
    return ok({ result: 'success', base_code: 'USD', rates: { USD: 1, RUB: 80 } });
  };
  const first = createInventoryService({ fetcher, sharedCache, now: () => time });
  const second = createInventoryService({ fetcher, sharedCache, now: () => time });
  const loading = first({ steamId64 });
  // Allow the first function to acquire the distributed lock.
  for (let i = 0; i < 10 && calls === 0; i++) await Promise.resolve();
  await assert.rejects(second({ steamId64 }), error => error.code === 'INVENTORY_BUSY');
  assert.equal(calls, 1);
  finish();
  await loading;
  const cached = await second({ steamId64, currency: 'USD' });
  assert.equal(cached.summary.totalCents, 1234);
  assert.equal(calls, 1);
  time += 120001;
  await second({ steamId64 });
  assert.equal(calls, 2);
});

test('A Steam cooldown is shared across instances and preserves the upstream delay', async () => {
  const time = Date.UTC(2026, 9, 18);
  const sharedCache = memorySharedCache(() => time);
  let calls = 0;
  const fetcher = async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '180' } }); };
  const first = createInventoryService({ fetcher, sharedCache, now: () => time });
  const second = createInventoryService({ fetcher, sharedCache, now: () => time });
  await assert.rejects(first({ steamId64 }), error => error.retryAt === time + 180000);
  await assert.rejects(second({ steamId64: '76561198060265729' }), error => error.retryAt === time + 180000);
  assert.equal(calls, 1);
});

test('Configured shared-cache outages stop requests before they reach Steam', async () => {
  let calls = 0;
  const evaluate = createInventoryService({ sharedCache: { get: async () => { throw new Error('offline'); } }, fetcher: async () => { calls++; } });
  await assert.rejects(evaluate({ steamId64 }), error => error.code === 'CACHE_UNAVAILABLE');
  assert.equal(calls, 0);
});

test('The Redis adapter uses authenticated POST commands and owner-checked unlocks', async () => {
  const commands = [];
  const cache = createSharedInventoryCache({ UPSTASH_REDIS_REST_URL: 'https://cache.example.test', UPSTASH_REDIS_REST_TOKEN: 'server-only-test-token' }, async (url, options) => {
    assert.equal(new URL(url).search, '');
    assert.equal(options.headers.Authorization, 'Bearer server-only-test-token');
    assert.equal(options.method, 'POST');
    const command = JSON.parse(options.body);
    commands.push(command);
    return ok({ result: command[0] === 'GET' ? null : command[0] === 'EVAL' ? 1 : 'OK' });
  });
  assert.equal(await cache.get('key'), null);
  await cache.set('key', { safe: true }, 120000);
  const owner = await cache.acquire('lock', 50000);
  await cache.release('lock', owner);
  assert.deepEqual(commands[1], ['SET', 'key', '{"safe":true}', 'PX', 120000]);
  assert.deepEqual(commands[2].slice(3), ['NX', 'PX', 50000]);
  assert.equal(commands[3][0], 'EVAL');
  assert.equal(commands[3].at(-1), owner);
  assert.equal(createSharedInventoryCache({}), null);
});

const apiRequest = (body, headers = {}) => new Request('https://site.example.test/api/inventory', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } });
const silentLogger = { warn() {} };

test('The HTTP handler returns the real retry delay in both the body and header', async () => {
  const now = Date.UTC(2026, 9, 18);
  const service = createInventoryService({ now: () => now, fetcher: async () => new Response('', { status: 429, headers: { 'Retry-After': '180' } }) });
  const handler = createInventoryHandler({ evaluate: service, env: {}, now: () => now, logger: silentLogger });
  const response = await handler(apiRequest({ steamId64 }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '180');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { error: { code: 'STEAM_RATE_LIMIT', retryAfterSeconds: 180 } });
});

test('A dedicated backend receives only validated public inventory parameters', async () => {
  let directCalls = 0;
  const handler = createInventoryHandler({
    evaluate: async () => { directCalls++; }, logger: silentLogger,
    env: { INVENTORY_BACKEND_URL: 'https://inventory.example.test/api/inventory', INVENTORY_BACKEND_TOKEN: 'test-service-token' },
    fetcher: async (url, options) => {
      assert.equal(String(url), 'https://inventory.example.test/api/inventory');
      assert.equal(options.headers.Authorization, 'Bearer test-service-token');
      assert.deepEqual(JSON.parse(options.body), { steamId64, appId: 730, currency: 'RUB' });
      return ok({ steamId64, appId: 730, currency: 'RUB', items: [], summary: { itemCount: 0, totalCents: 0 }, pricing: {} });
    },
  });
  const response = await handler(apiRequest({ steamId64, token: 'do-not-forward', tradeUrl }));
  assert.equal(response.status, 200);
  assert.equal(directCalls, 0);
});

test('Backend authentication, invalid input and backend failures never fall back to Steam', async () => {
  let directCalls = 0;
  let remoteCalls = 0;
  const handler = createInventoryHandler({
    evaluate: async () => { directCalls++; }, logger: silentLogger,
    env: { INVENTORY_BACKEND_URL: 'https://inventory.example.test/api/inventory', INVENTORY_BACKEND_TOKEN: 'test-token', INVENTORY_API_TOKEN: 'inbound-test-token' },
    fetcher: async () => { remoteCalls++; throw new Error('offline'); },
  });
  assert.equal((await handler(apiRequest({ steamId64 }))).status, 401);
  const authorization = { Authorization: 'Bearer inbound-test-token' };
  assert.equal((await handler(apiRequest({ steamId64: 'bad' }, authorization))).status, 400);
  assert.equal((await handler(apiRequest({ steamId64 }, authorization))).status, 503);
  assert.equal(directCalls, 0);
  assert.equal(remoteCalls, 1);
});

test('A dedicated backend rate limit reaches the browser without losing Retry-After', async () => {
  const handler = createInventoryHandler({
    logger: silentLogger, env: { INVENTORY_BACKEND_URL: 'https://inventory.example.test/api/inventory', INVENTORY_BACKEND_TOKEN: 'test-token' },
    fetcher: async () => Response.json({ error: { code: 'STEAM_RATE_LIMIT' } }, { status: 429, headers: { 'Retry-After': '180' } }),
  });
  const response = await handler(apiRequest({ steamId64 }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '180');
  assert.equal((await response.json()).error.retryAfterSeconds, 180);
});
