import { evaluateInventory, InventoryError } from '../../../lib/server/inventory.mjs';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    if (Number(request.headers.get('content-length')) > 1024) {
      return Response.json({ error: { code: 'INVALID_REQUEST' } }, { status: 413, headers });
    }
    const body = await request.text();
    if (body.length > 1024) return Response.json({ error: { code: 'INVALID_REQUEST' } }, { status: 413, headers });
    let input;
    try { input = JSON.parse(body); } catch { throw new InventoryError('INVALID_REQUEST', 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InventoryError('INVALID_REQUEST', 400);
    const result = await evaluateInventory({ steamId64: input.steamId64, appId: input.appId, currency: input.currency });
    return Response.json(result, { headers });
  } catch (error) {
    const expected = error instanceof InventoryError;
    const status = expected ? error.status : 500;
    return Response.json({ error: { code: expected ? error.code : 'INTERNAL_ERROR' } }, {
      status, headers: { ...headers, ...(status === 429 ? { 'Retry-After': '60' } : {}) },
    });
  }
}
