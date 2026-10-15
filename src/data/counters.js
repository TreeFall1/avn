// A fixed UTC starting point makes the figures deterministic for every visitor.
// Rates are per second; rounding happens only after the elapsed time is applied.
export const COUNTER_EPOCH = Date.UTC(2026, 9, 12, 19, 30, 0);

const counters = {
  liveSold: { base: 9512731, rate: 1 / 4 },
  items: { base: 9853082, rate: 1 / 3 },
  purchased: { base: 1717829, rate: 1 / 6 },
  reviews: { base: 25826, rate: 1 / 600 },
  partners: { base: 285411350, rate: 3 },
};

export function calculateCounters(timestamp) {
  const seconds = Math.max(0, (timestamp - COUNTER_EPOCH) / 1000);
  return Object.fromEntries(
    Object.entries(counters).map(([key, { base, rate }]) => [key, base + Math.floor(seconds * rate)]),
  );
}

export const initialCounters = calculateCounters(COUNTER_EPOCH);
