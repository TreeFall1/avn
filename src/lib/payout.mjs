export const MINIMUM_PAYOUT_RUB_CENTS = 10_000;

export function formatPayoutDate(now, locale) {
  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric', month: 'long', timeZone: 'Europe/Moscow',
  }).format(new Date(now + 7 * 86_400_000));
}

export const PAYOUT_METHODS = [
  { id: 'card', image: 'card.svg', label: 'Cards', fields: ['email', 'card', 'fullName'] },
  { id: 'sbp', image: '16.svg', label: 'СБП', fields: ['email', 'phone', 'bank'] },
  { id: 'bank', image: '19.svg', label: 'Bank Transfer', fields: ['email', 'iban', 'fullName'] },
  { id: 'paypal', image: '15.svg', label: 'PayPal', fields: ['email'] },
  { id: 'usdt-trc20', image: '5.svg', label: 'USDT · TRC-20', network: 'TRON (TRC-20)', address: 'tron', fields: ['email', 'wallet'] },
  { id: 'usdt-bep20', image: '32.svg', label: 'USDT · BEP-20', network: 'BNB Smart Chain (BEP-20)', address: 'evm', fields: ['email', 'wallet'] },
  { id: 'bnb', image: '31.svg', label: 'BNB', network: 'BNB Smart Chain (BEP-20)', address: 'evm', fields: ['email', 'wallet'] },
  { id: 'usdt-erc20', image: '4.svg', label: 'USDT · ERC-20', network: 'Ethereum (ERC-20)', address: 'evm', fields: ['email', 'wallet'] },
  { id: 'btc', image: '2.svg', label: 'Bitcoin', network: 'Bitcoin', address: 'btc', fields: ['email', 'wallet'] },
  { id: 'eth', image: '3.svg', label: 'Ethereum', network: 'Ethereum', address: 'evm', fields: ['email', 'wallet'] },
  { id: 'tron', image: '6.svg', label: 'TRON', network: 'TRON', address: 'tron', fields: ['email', 'wallet'] },
  { id: 'ltc', image: '18.svg', label: 'Litecoin', network: 'Litecoin', address: 'ltc', fields: ['email', 'wallet'] },
  { id: 'sol', image: '27.svg', label: 'Solana', network: 'Solana', address: 'sol', fields: ['email', 'wallet'] },
  { id: 'gram', image: '17.svg', label: 'GRAM', network: 'TON', address: 'ton', fields: ['email', 'wallet'] },
  { id: 'steam', image: '24.svg', label: 'Steam', fields: ['email', 'steamProfile'] },
  { id: 'balance', image: '20-balance.svg', label: 'Balance', fields: ['email'] },
];

export function getMinimumPayoutCents(currency, rates) {
  if (currency === 'RUB') return MINIMUM_PAYOUT_RUB_CENTS;
  const rubRate = rates?.RUB;
  const currencyRate = currency === 'USD' ? 1 : rates?.[currency];
  if (!Number.isFinite(rubRate) || rubRate <= 0 || !Number.isFinite(currencyRate) || currencyRate <= 0) return null;
  return Math.ceil(MINIMUM_PAYOUT_RUB_CENTS * currencyRate / rubRate);
}

export function canSelectPayout(totalCents, minimumCents) {
  return Number.isSafeInteger(totalCents) && Number.isSafeInteger(minimumCents) && minimumCents > 0 && totalCents >= minimumCents;
}

function validCard(value) {
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = digits.length - 1, doubled = false; i >= 0; i--, doubled = !doubled) {
    let digit = Number(digits[i]);
    if (doubled) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
  }
  return sum % 10 === 0;
}

function validIban(value) {
  const iban = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z\d]{11,30}$/.test(iban)) return false;
  const rearranged = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, letter => String(letter.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of rearranged) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

const walletPatterns = {
  evm: /^0x[\da-fA-F]{40}$/,
  tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  btc: /^(?:bc1[ac-hj-np-z02-9]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/,
  ltc: /^(?:ltc1[ac-hj-np-z02-9]{11,87}|[LM3][1-9A-HJ-NP-Za-km-z]{25,34})$/,
  sol: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  ton: /^(?:(?:EQ|UQ|kQ|0Q)[A-Za-z\d_-]{46}|(?:0|-1):[\da-fA-F]{64})$/,
};

export function validatePayoutFields(methodId, fields) {
  const method = PAYOUT_METHODS.find(entry => entry.id === methodId);
  if (!method) return { method: 'required' };
  const errors = {};
  for (const field of method.fields) {
    const value = typeof fields[field] === 'string' ? fields[field].trim() : '';
    if (!value) { errors[field] = 'required'; continue; }
    if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[field] = 'email';
    if (field === 'card' && !validCard(value)) errors[field] = 'card';
    if (field === 'iban' && !validIban(value)) errors[field] = 'iban';
    if (field === 'phone' && !/^(?:\+7|7|8)\d{10}$/.test(value.replace(/[\s()-]/g, ''))) errors[field] = 'phone';
    if (field === 'fullName' && value.length < 2) errors[field] = 'fullName';
    if (field === 'wallet' && !walletPatterns[method.address].test(value)) errors[field] = 'wallet';
    if (field === 'steamProfile') {
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.hostname !== 'steamcommunity.com' || url.port || url.username || url.password ||
          !/^\/(?:profiles\/7656119\d{10}|id\/[\w-]{2,32})\/?$/.test(url.pathname)) errors[field] = 'steamProfile';
      } catch { errors[field] = 'steamProfile'; }
    }
  }
  return errors;
}
