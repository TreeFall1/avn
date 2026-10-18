export function retryAfterSeconds(value, now = Date.now(), fallback = 60) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (/^\d+$/.test(text)) return Math.max(1, Math.min(86_400, Number(text)));
  const date = /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text) ? Date.parse(text) : NaN;
  if (Number.isFinite(date)) return Math.max(1, Math.min(86_400, Math.ceil((date - now) / 1000)));
  return Math.max(1, Math.min(86_400, Math.ceil(fallback)));
}
