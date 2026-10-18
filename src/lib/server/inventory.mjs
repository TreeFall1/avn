import archivedPrices from '../../data/inventory-prices.json' with { type: 'json' };
import { GAMES, INVENTORY_CURRENCIES, isSteamId64, normalizeInventory, summarizeInventory } from '../inventory.mjs';
import { getMinimumPayoutCents } from '../payout.mjs';

export class InventoryError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// Process-local, bounded caches also coalesce concurrent requests. Public inventory
// data is cached briefly; private trade tokens are never sent here or retained.
export function createInventoryService({ fetcher = (...args) => fetch(...args), now = Date.now } = {}) {
  const inventoryCache = new Map();
  const priceCache = new Map();
  let ratesCache;

  async function json(url, source, signal) {
    let response;
    try {
      response = await fetcher(url, {
        cache: 'no-store', redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
        headers: { Accept: 'application/json', ...(source === 'prices' ? { 'Accept-Encoding': 'br' } : {}) },
      });
    } catch (error) {
      throw new InventoryError(error.name === 'TimeoutError' || signal.aborted ? 'TIMEOUT' : `${source.toUpperCase()}_UNAVAILABLE`, 503);
    }
    if (response.status === 429) throw new InventoryError(source === 'steam' ? 'STEAM_RATE_LIMIT' : 'PRICES_UNAVAILABLE', 429);
    if (source === 'steam' && [401, 403].includes(response.status)) throw new InventoryError('PRIVATE_INVENTORY', 403);
    if (source === 'steam' && response.status === 404) throw new InventoryError('INVENTORY_NOT_FOUND', 404);
    if (!response.ok) throw new InventoryError(`${source.toUpperCase()}_UNAVAILABLE`, 503);
    try {
      const data = await response.json();
      if (!data || typeof data !== 'object') throw new Error('Invalid upstream JSON');
      return data;
    }
    catch { throw new InventoryError(`${source.toUpperCase()}_UNAVAILABLE`); }
  }

  async function fetchInventory(steamId64, appId, signal) {
    const assets = new Map();
    const descriptions = new Map();
    const cursors = new Set();
    let cursor;
    for (let page = 0; page < 20; page++) {
      const url = new URL(`https://steamcommunity.com/inventory/${steamId64}/${appId}/2`);
      url.search = new URLSearchParams({ l: 'english', count: '2000', ...(cursor ? { start_assetid: cursor } : {}) });
      const data = await json(url, 'steam', signal);
      if (data.success !== 1 && data.success !== true) throw new InventoryError('STEAM_UNAVAILABLE', 503);
      if ((!Array.isArray(data.assets) && data.total_inventory_count !== 0) ||
          (data.assets?.length && !Array.isArray(data.descriptions))) throw new InventoryError('STEAM_UNAVAILABLE');
      for (const asset of data.assets || []) assets.set(asset.assetid, asset);
      for (const description of data.descriptions || []) descriptions.set(`${description.classid}:${description.instanceid || '0'}`, description);
      if (!data.more_items) return { assets: [...assets.values()], descriptions: [...descriptions.values()] };
      cursor = String(data.last_assetid || '');
      if (!/^\d+$/.test(cursor) || cursors.has(cursor)) throw new InventoryError('INCOMPLETE_INVENTORY');
      cursors.add(cursor);
    }
    throw new InventoryError('INVENTORY_TOO_LARGE', 422);
  }

  function getInventory(steamId64, appId, signal) {
    const key = `${steamId64}:${appId}`;
    const cached = inventoryCache.get(key);
    if (cached && cached.expires > now()) return cached.promise;
    if (inventoryCache.size >= 100) inventoryCache.delete(inventoryCache.keys().next().value);
    const entry = { expires: now() + 30_000 };
    entry.promise = fetchInventory(steamId64, appId, signal).catch(error => {
      if (inventoryCache.get(key) === entry) inventoryCache.delete(key);
      throw error;
    });
    inventoryCache.set(key, entry);
    return entry.promise;
  }

  function getPrices(appId, signal) {
    const cached = priceCache.get(appId);
    if (cached && cached.expires > now()) return cached.promise;
    const entry = { expires: now() + 5 * 60_000 };
    entry.promise = (async () => {
      try {
        const rows = await json(`https://api.skinport.com/v1/items?app_id=${appId}&currency=USD&tradable=0`, 'prices', signal);
        if (!Array.isArray(rows) || !rows.length) throw new InventoryError('PRICES_UNAVAILABLE');
        const prices = new Map();
        for (const row of rows) {
          if (row.currency !== 'USD' || typeof row.market_hash_name !== 'string') continue;
          // Retain pricex2's mean-price-first valuation, including a valid zero.
          const price = row.mean_price ?? row.suggested_price;
          if (typeof price === 'number' && Number.isFinite(price) && price >= 0) prices.set(row.market_hash_name, price);
        }
        if (!prices.size) throw new InventoryError('PRICES_UNAVAILABLE');
        entry.live = { prices, source: 'skinport', updatedAt: new Date(now()).toISOString() };
        return entry.live;
      } catch {
        if (cached?.live) {
          entry.live = cached.live;
          return { ...cached.live, source: 'cached' };
        }
        if (appId === 730) return { prices: new Map(archivedPrices.items), source: 'archive', updatedAt: archivedPrices.updatedAt };
        return { prices: new Map(), source: 'unavailable', updatedAt: null };
      }
    })();
    priceCache.set(appId, entry);
    return entry.promise;
  }

  function getRates(signal) {
    if (ratesCache && ratesCache.expires > now()) return ratesCache.promise;
    const previous = ratesCache;
    const entry = { expires: now() + 60 * 60_000 };
    entry.promise = (async () => {
      try {
        const data = await json('https://open.er-api.com/v6/latest/USD', 'rates', signal);
        if (data.result !== 'success' || data.base_code !== 'USD' || !data.rates) throw new InventoryError('RATES_UNAVAILABLE');
        entry.value = data.rates;
        return { rates: data.rates, stale: false };
      } catch {
        entry.expires = now() + 60_000;
        entry.value = previous?.value;
        return { rates: previous?.value || { USD: 1 }, stale: true };
      }
    })();
    ratesCache = entry;
    return entry.promise;
  }

  return async function evaluate({ steamId64, appId = 730, currency = 'RUB' }) {
    if (!isSteamId64(steamId64)) throw new InventoryError('INVALID_STEAM_ID', 400);
    if (!GAMES.some(game => game.id === appId)) throw new InventoryError('INVALID_GAME', 400);
    if (!INVENTORY_CURRENCIES.includes(currency)) throw new InventoryError('INVALID_CURRENCY', 400);
    const signal = AbortSignal.timeout(45_000);
    const inventory = await getInventory(steamId64, appId, signal);
    const [pricing, conversion] = await Promise.all([
      inventory.assets.length ? getPrices(appId, signal) : { prices: new Map(), source: 'skinport', updatedAt: null },
      getRates(signal),
    ]);
    const requestedRate = currency === 'USD' ? 1 : conversion.rates[currency];
    const currencyAvailable = typeof requestedRate === 'number' && Number.isFinite(requestedRate) && requestedRate > 0;
    const resultCurrency = currencyAvailable ? currency : 'USD';
    const items = normalizeInventory(inventory.assets, inventory.descriptions, pricing.prices, currencyAvailable ? requestedRate : 1);
    return {
      steamId64, appId, currency: resultCurrency, items, summary: summarizeInventory(items),
      minimumPayoutCents: getMinimumPayoutCents(resultCurrency, conversion.rates),
      pricing: { source: pricing.source, updatedAt: pricing.updatedAt, method: 'mean_price' },
      warnings: [
        ...(pricing.source === 'archive' ? ['ARCHIVE_PRICES'] : []),
        ...(pricing.source === 'cached' ? ['CACHED_PRICES'] : []),
        ...(pricing.source === 'unavailable' ? ['PRICES_UNAVAILABLE'] : []),
        ...(!currencyAvailable ? ['CURRENCY_FALLBACK'] : conversion.stale ? ['CACHED_RATES'] : []),
      ],
      evaluatedAt: new Date(now()).toISOString(),
      exchangeRateProvider: resultCurrency !== 'USD' ? 'https://www.exchangerate-api.com' : null,
    };
  };
}

export const evaluateInventory = createInventoryService();
