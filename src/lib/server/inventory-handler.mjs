import { timingSafeEqual } from 'node:crypto';
import { GAMES, INVENTORY_CURRENCIES, isSteamId64 } from '../inventory.mjs';
import { retryAfterSeconds } from '../retry.mjs';
import { evaluateInventory, InventoryError } from './inventory.mjs';

const BACKEND_ERRORS = new Set([
  'STEAM_RATE_LIMIT', 'PRIVATE_INVENTORY', 'INVENTORY_NOT_FOUND', 'INVENTORY_BUSY',
  'STEAM_UNAVAILABLE', 'TIMEOUT', 'INCOMPLETE_INVENTORY', 'INVENTORY_TOO_LARGE', 'CACHE_UNAVAILABLE',
]);

function authorized(request, token) {
  const actual = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createInventoryHandler({ evaluate = evaluateInventory, env = process.env, fetcher = (...args) => fetch(...args), now = Date.now, logger = console } = {}) {
  return async function POST(request) {
    const headers = { 'Cache-Control': 'no-store' };
    try {
      if (env.INVENTORY_API_TOKEN && !authorized(request, env.INVENTORY_API_TOKEN)) throw new InventoryError('UNAUTHORIZED', 401);
      if (Number(request.headers.get('content-length')) > 1024) throw new InventoryError('INVALID_REQUEST', 413);
      const text = await request.text();
      if (text.length > 1024) throw new InventoryError('INVALID_REQUEST', 413);
      let input;
      try { input = JSON.parse(text); } catch { throw new InventoryError('INVALID_REQUEST', 400); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InventoryError('INVALID_REQUEST', 400);
      const params = { steamId64: input.steamId64, appId: input.appId ?? 730, currency: input.currency ?? 'RUB' };
      if (!isSteamId64(params.steamId64)) throw new InventoryError('INVALID_STEAM_ID', 400);
      if (!GAMES.some(game => game.id === params.appId)) throw new InventoryError('INVALID_GAME', 400);
      if (!INVENTORY_CURRENCIES.includes(params.currency)) throw new InventoryError('INVALID_CURRENCY', 400);

      if (!env.INVENTORY_BACKEND_URL) return Response.json(await evaluate(params), { headers });

      // Optional dedicated backend: run this same project on a server with its own egress IP.
      // Never fall back to direct Steam requests when that backend is unavailable.
      let url;
      try { url = new URL(env.INVENTORY_BACKEND_URL); } catch { throw new InventoryError('BACKEND_UNAVAILABLE', 503); }
      if (!env.INVENTORY_BACKEND_TOKEN || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
          url.origin === new URL(request.url).origin || request.headers.has('x-inventory-hop')) throw new InventoryError('BACKEND_UNAVAILABLE', 503);
      let response;
      try {
        response = await fetcher(url, {
          method: 'POST', headers: { Authorization: `Bearer ${env.INVENTORY_BACKEND_TOKEN}`, 'Content-Type': 'application/json', 'X-Inventory-Hop': '1' },
          body: JSON.stringify(params), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(50_000),
        });
      } catch { throw new InventoryError('BACKEND_UNAVAILABLE', 503); }
      let data;
      try { data = await response.json(); } catch { throw new InventoryError('BACKEND_UNAVAILABLE', 503); }
      if (!response.ok) {
        const code = BACKEND_ERRORS.has(data?.error?.code) ? data.error.code : 'BACKEND_UNAVAILABLE';
        const delay = response.headers.get('Retry-After') || (Number.isFinite(data?.error?.retryAfterSeconds) ? String(data.error.retryAfterSeconds) : null);
        const retryAt = delay || response.status === 429 ? now() + retryAfterSeconds(delay, now()) * 1000 : null;
        throw new InventoryError(code, code === 'BACKEND_UNAVAILABLE' ? 503 : response.status, retryAt);
      }
      if (!data || data.steamId64 !== params.steamId64 || data.appId !== params.appId || !INVENTORY_CURRENCIES.includes(data.currency) ||
          !Array.isArray(data.items) || !data.summary || !data.pricing) throw new InventoryError('BACKEND_UNAVAILABLE', 503);
      return Response.json(data, { headers });
    } catch (error) {
      const expected = error instanceof InventoryError;
      const status = expected ? error.status : 500;
      const code = expected ? error.code : 'INTERNAL_ERROR';
      const seconds = expected && error.retryAt ? Math.max(1, Math.ceil((error.retryAt - now()) / 1000)) : status === 429 ? 60 : null;
      if (seconds) headers['Retry-After'] = String(seconds);
      // Operational metadata only: no Trade URL, token, Steam ID or payout details.
      if (status >= 429) logger.warn('inventory_request_failed', { code, status, retryAfterSeconds: seconds, region: env.VERCEL_REGION || 'local', transport: env.INVENTORY_BACKEND_URL ? 'backend' : 'direct' });
      return Response.json({ error: { code, ...(seconds ? { retryAfterSeconds: seconds } : {}) } }, { status, headers });
    }
  };
}
