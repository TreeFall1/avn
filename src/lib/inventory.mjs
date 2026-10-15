export const GAMES = [
  { id: 730, name: 'CS2', label: 'CS' },
  { id: 570, name: 'Dota 2', label: '◈' },
  { id: 252490, name: 'Rust', label: '▧' },
  { id: 440, name: 'TF2', label: '◉' },
];

export const INVENTORY_CURRENCIES = ['RUB', 'USD', 'UAH', 'BYN', 'KZT', 'EUR'];
const STEAM_ID_BASE = 76561197960265728n;
const MAX_ACCOUNT_ID = 4294967295n;

export function isSteamId64(value) {
  if (typeof value !== 'string' || !/^\d{17}$/.test(value)) return false;
  const account = BigInt(value) - STEAM_ID_BASE;
  return account > 0n && account <= MAX_ACCOUNT_ID;
}

// Parse locally: the trade token is never needed by the valuation server.
export function steamIdFromTradeUrl(value) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'steamcommunity.com' || url.port ||
        url.username || url.password || !/^\/tradeoffer\/new\/?$/.test(url.pathname) ||
        url.searchParams.getAll('partner').length !== 1 || url.searchParams.getAll('token').length !== 1) return null;
    const partner = url.searchParams.get('partner');
    const token = url.searchParams.get('token');
    if (!/^[1-9]\d{0,9}$/.test(partner || '') || !/^[\w-]{8}$/.test(token || '')) return null;
    const account = BigInt(partner);
    return account <= MAX_ACCOUNT_ID ? String(STEAM_ID_BASE + account) : null;
  } catch {
    return null;
  }
}

export function formatInventoryMoney(cents, currency, locale) {
  return new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    style: 'currency', currency, maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function summarizeInventory(items) {
  return items.reduce((summary, item) => {
    summary.itemCount += item.quantity;
    if (item.priceCents === null) summary.unpricedCount += item.quantity;
    else {
      summary.pricedCount += item.quantity;
      summary.totalCents += item.priceCents;
    }
    return summary;
  }, { itemCount: 0, pricedCount: 0, unpricedCount: 0, totalCents: 0 });
}

export function normalizeInventory(assets, descriptions, prices, rate = 1) {
  const lookup = new Map(descriptions.map(item => [`${item.classid}:${item.instanceid || '0'}`, item]));
  const conditions = { 'Factory New': 'FN', 'Minimal Wear': 'MW', 'Field-Tested': 'FT', 'Well-Worn': 'WW', 'Battle-Scarred': 'BS' };
  return assets.map(asset => {
    const description = lookup.get(`${asset.classid}:${asset.instanceid || '0'}`);
    const name = description?.market_hash_name || description?.name || 'Unknown item';
    const quantity = Math.max(1, Math.min(1_000_000, Number.parseInt(asset.amount, 10) || 1));
    const price = prices.get(name);
    const unitPriceCents = Number.isFinite(price) && price >= 0 ? Math.round(price * rate * 100) : null;
    const exterior = description?.tags?.find(tag => tag.category === 'Exterior')?.localized_tag_name ||
      description?.descriptions?.find(entry => entry.value?.startsWith('Exterior: '))?.value.slice(10) ||
      name.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/)?.[1];
    const rarity = description?.tags?.find(tag => tag.category === 'Rarity')?.color;
    const icon = description?.icon_url;
    return {
      id: String(asset.assetid), name, quantity,
      condition: conditions[exterior] || '',
      rarityColor: /^[a-f\d]{6}$/i.test(rarity || '') ? `#${rarity}` : '#8993a4',
      image: typeof icon === 'string' && /^[\w/-]+$/.test(icon) ? `https://community.fastly.steamstatic.com/economy/image/${icon}/256fx192f` : null,
      tradable: description?.tradable === 1,
      marketable: description?.marketable === 1,
      unitPriceCents, priceCents: unitPriceCents === null ? null : unitPriceCents * quantity,
    };
  });
}
