import { randomUUID } from 'node:crypto';

const RELEASE_LOCK = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

// Credentials are server-only. No Trade URL, token or payout details enter this store.
export function createSharedInventoryCache(env = process.env, fetcher = (...args) => fetch(...args)) {
  const endpoint = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!endpoint && !token) return null;

  async function command(args) {
    if (!endpoint || !token) throw new Error('Shared inventory cache is not configured');
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid shared cache endpoint');
    const response = await fetcher(url, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error('Shared inventory cache is unavailable');
    const data = await response.json();
    if (!data || data.error || !Object.hasOwn(data, 'result')) throw new Error('Shared inventory cache command failed');
    return data.result;
  }

  return {
    async get(key) {
      const value = await command(['GET', key]);
      return value === null ? null : JSON.parse(value);
    },
    async set(key, value, ttlMs) {
      await command(['SET', key, JSON.stringify(value), 'PX', Math.max(1, Math.ceil(ttlMs))]);
    },
    async acquire(key, ttlMs) {
      const owner = randomUUID();
      const result = await command(['SET', key, owner, 'NX', 'PX', ttlMs]);
      return result === 'OK' ? owner : null;
    },
    async release(key, owner) {
      await command(['EVAL', RELEASE_LOCK, 1, key, owner]);
    },
  };
}
