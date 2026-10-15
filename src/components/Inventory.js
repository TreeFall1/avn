'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { GAMES, formatInventoryMoney, steamIdFromTradeUrl, summarizeInventory } from '../lib/inventory.mjs';
import { inventoryCopy } from '../data/inventory-copy';
import reference from '../data/reference-content.json';
import base from './HomePage.module.scss';
import styles from './Inventory.module.scss';

const payoutMethods = [
  ['card.svg', 'Cards'], ['16.svg', 'СБП'], ['19.svg', 'Bank Transfer'],
  ['15.svg', 'PayPal'], ['5.svg', 'TRC'], ['32.svg', 'BEP-20'],
  ['31.svg', 'BNB'], ['4.svg', 'ERC-20'], ['2.svg', 'BTC'],
  ['3.svg', 'Ethereum'], ['6.svg', 'TRON'], ['18.svg', 'Litecoin'],
  ['27.svg', 'Solana'], ['17.svg', 'GRAM'], ['24.svg', 'Steam'], ['20-balance.svg', 'Balance'],
];
const TRADE_HELP = 'https://steamcommunity.com/my/tradeoffers/privacy#trade_offer_access_url';
const PAGE_SIZE = 100;

export default function Inventory({ t, currency, locale }) {
  const copy = inventoryCopy[locale];
  const [appId, setAppId] = useState(730);
  const [tradeUrl, setTradeUrl] = useState('');
  const [steamId, setSteamId] = useState(null);
  const [editing, setEditing] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [request, setRequest] = useState({ key: '', status: 'idle', data: null, error: null });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('price-desc');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selection, setSelection] = useState({ identity: '', ids: null });
  const inputRef = useRef(null);
  const identity = `${steamId}:${appId}`;
  const key = `${identity}:${currency}`;
  const result = request.key === key ? request.data : null;
  const loading = Boolean(steamId) && (request.key !== key || request.status === 'loading');
  const error = request.key === key ? request.error : null;
  const items = result?.items || [];
  const selectedIds = selection.identity === identity ? selection.ids : null;
  const isSelected = item => item.priceCents !== null && (selectedIds === null || selectedIds.has(item.id));
  const selected = summarizeInventory(items.filter(isSelected));
  const money = cents => formatInventoryMoney(cents, result?.currency || currency, locale);
  const date = value => value ? new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) : '';

  useEffect(() => {
    if (!steamId) return;
    const controller = new AbortController();
    let active = true;
    setRequest(previous => ({ key, status: 'loading', data: previous.key === key ? previous.data : null, error: null }));
    (async () => {
      try {
        const response = await fetch('/api/inventory', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ steamId64: steamId, appId, currency }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)]),
        });
        const data = await response.json();
        if (!response.ok) throw Object.assign(new Error('Inventory request failed'), { code: data.error?.code });
        if (!Array.isArray(data.items) || !data.summary || !data.pricing) throw new Error('Invalid response');
        if (active) {
          setRequest({ key, status: 'success', data, error: null });
          setEditing(false);
        }
      } catch (failure) {
        if (active) setRequest({ key, status: 'error', data: null, error: failure.code || (failure.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR') });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [steamId, appId, currency, refresh, key]);

  useEffect(() => {
    if (editing && steamId) inputRef.current?.focus();
  }, [editing, steamId]);

  const visibleItems = useMemo(() => {
    const search = query.trim().toLocaleLowerCase(locale);
    return (result?.items || []).filter(item => `${item.name} ${item.condition}`.toLocaleLowerCase(locale).includes(search)).sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, locale);
      if (a.priceCents === null) return b.priceCents === null ? a.name.localeCompare(b.name, locale) : 1;
      if (b.priceCents === null) return -1;
      return sort === 'price-asc' ? a.priceCents - b.priceCents : b.priceCents - a.priceCents;
    });
  }, [result, query, sort, locale]);
  const pricedVisible = visibleItems.filter(item => item.priceCents !== null);
  const allVisibleSelected = pricedVisible.length > 0 && pricedVisible.every(isSelected);

  function submit(event) {
    event.preventDefault();
    const parsed = steamIdFromTradeUrl(tradeUrl);
    if (!parsed) { setInvalid(true); inputRef.current?.focus(); return; }
    setInvalid(false);
    setSteamId(parsed);
    setQuery('');
    setLimit(PAGE_SIZE);
    setRefresh(value => value + 1);
  }

  function toggle(item) {
    setSelection(previous => {
      const ids = previous.identity === identity && previous.ids !== null ? new Set(previous.ids) : new Set(items.filter(entry => entry.priceCents !== null).map(entry => entry.id));
      if (ids.has(item.id)) ids.delete(item.id); else ids.add(item.id);
      return { identity, ids };
    });
  }

  function selectVisible() {
    const ids = new Set(items.filter(isSelected).map(item => item.id));
    for (const item of pricedVisible) { if (allVisibleSelected) ids.delete(item.id); else ids.add(item.id); }
    setSelection({ identity, ids });
  }

  const showGate = editing || !result;
  return <section id="inventory" className={`${base.inventorySection} ${styles.section} ${result ? styles.loaded : ''}`} aria-label={copy.title}>
    <div className={`${base.inventoryPane} ${styles.pane}`} aria-busy={loading}>
      <div className={`${base.inventoryHeading} ${styles.heading}`}>
        <h2>{t.sell}</h2>
        <button type="button" onClick={() => { setEditing(true); setInvalid(false); inputRef.current?.focus(); }}><img src="/assets/icons/linkIcon.svg" alt=""/>{copy.change}</button>
      </div>
      <div className={`${base.inventoryControls} ${styles.controls}`}>
        <div className={base.inventoryGames} aria-label={locale === 'ru' ? 'Игра' : 'Game'}>
          {GAMES.map(game => <button type="button" className={appId === game.id ? base.inventoryGameActive : ''} aria-label={game.name} aria-pressed={appId === game.id} title={game.name} key={game.id} onClick={() => { setAppId(game.id); setQuery(''); setLimit(PAGE_SIZE); }}>{game.label}</button>)}
        </div>
        <input aria-label={t.findItem} placeholder={t.findItem} value={query} disabled={!result || loading || editing} onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }}/>
        <select aria-label={copy.sort} value={sort} disabled={!result || loading || editing} onChange={event => setSort(event.target.value)}>
          <option value="price-desc">{copy.expensive}</option><option value="price-asc">{copy.cheap}</option><option value="name">{copy.name}</option>
        </select>
        <button type="button" className={styles.selectAll} onClick={selectVisible} aria-pressed={allVisibleSelected} disabled={!pricedVisible.length || loading || editing}>{query ? copy.selectVisible : copy.selectAll} {allVisibleSelected ? '●' : '◯'}</button>
        <button type="button" className={styles.clear} onClick={() => setSelection({ identity, ids: new Set() })} disabled={!selected.itemCount || loading || editing} aria-label={copy.clear} title={copy.clear}><img src="/assets/icons/broom.svg" alt=""/></button>
        <button type="button" className={styles.refresh} onClick={() => setRefresh(value => value + 1)} disabled={!steamId || loading || editing} aria-label={copy.refresh} title={copy.refresh}>⟳</button>
      </div>
      {showGate ? <>
        <div className={base.inventoryThumbs} aria-hidden="true">{reference.inventory.map((image, index) => <div className={base.inventoryThumb} key={index}><img src={image} alt=""/></div>)}</div>
        <div className={styles.gate}>
          <form className={styles.form} onSubmit={submit} noValidate>
            <h3>{copy.title}</h3><p>{copy.intro}</p>
            <label htmlFor="inventory-trade-url">Trade URL</label>
            <input ref={inputRef} id="inventory-trade-url" type="url" autoComplete="off" spellCheck={false} inputMode="url" maxLength={512} placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…" value={tradeUrl} aria-invalid={invalid} aria-describedby={invalid ? 'inventory-url-error' : 'inventory-url-help'} disabled={loading} onChange={event => { setTradeUrl(event.target.value); setInvalid(false); }}/>
            {invalid && <p className={styles.error} id="inventory-url-error" role="alert">{copy.invalidUrl}</p>}
            {error && <p className={styles.error} role="alert">{copy.errors[error] || copy.errors.INTERNAL_ERROR}</p>}
            <button className={base.yellowButton} type="submit" disabled={loading || !tradeUrl.trim()}>{loading ? <><span className={styles.spinner}/>{copy.loading}</> : copy.evaluate}</button>
            <div className={styles.formLinks}><a href={TRADE_HELP} target="_blank" rel="noopener noreferrer">{copy.help} ↗</a>{editing && result && <button type="button" onClick={() => { setEditing(false); setInvalid(false); }}>{copy.cancel}</button>}</div>
            <small id="inventory-url-help">{copy.publicNote}</small>
            {loading && <span role="status" className={styles.srOnly}>{copy.loading}</span>}
          </form>
        </div>
      </> : <>
        <div className={styles.itemStatus} role="status"><span>{loading ? copy.loading : `${copy.items}: ${result.summary.itemCount}`}</span><a href={`https://steamcommunity.com/profiles/${result.steamId64}/inventory/#${appId}`} target="_blank" rel="noopener noreferrer">{copy.profile} ↗</a></div>
        <div className={styles.itemScroll}>
          {visibleItems.length ? <div className={styles.items}>{visibleItems.slice(0, limit).map(item => <button key={item.id} type="button" className={`${styles.item} ${isSelected(item) ? styles.itemSelected : ''}`} style={{ '--rarity': item.rarityColor }} aria-pressed={isSelected(item)} aria-label={`${item.name}, ${item.priceCents === null ? copy.noPrice : money(item.priceCents)}${item.quantity > 1 ? `, ×${item.quantity}` : ''}`} title={item.name} disabled={item.priceCents === null || loading} onClick={() => toggle(item)}>
            <span className={styles.itemTop}><span>{item.condition}{item.quantity > 1 && <span title={copy.quantity}> · ×{item.quantity}</span>}</span><span>{!item.tradable && <span title={copy.locked} aria-label={copy.locked}>▣ </span>}{isSelected(item) ? '●' : '○'}</span></span>
            {item.image ? <img src={item.image} alt="" loading="lazy" onError={event => { event.currentTarget.style.visibility = 'hidden'; }}/> : <span className={styles.noImage}>◇</span>}
            <span className={styles.itemName}>{item.name}</span><span className={styles.itemPrice}>{item.priceCents === null ? copy.noPrice : money(item.priceCents)}</span>
          </button>)}</div> : <div className={styles.empty}><h3>{query ? copy.noResults : copy.empty}</h3>{query ? <button type="button" onClick={() => setQuery('')}>{copy.resetSearch}</button> : <p>{copy.emptyHint}</p>}</div>}
          {visibleItems.length > limit && <button type="button" className={styles.more} onClick={() => setLimit(value => value + PAGE_SIZE)}>{copy.more} · {copy.shown} {limit} {copy.of} {visibleItems.length}</button>}
        </div>
      </>}
    </div>
    <aside className={`${base.payoutPane} ${styles.summary}`} aria-live="polite" aria-atomic="true">
      <div className={base.payoutHeading}><span>{result ? `${copy.selected}: ${selected.itemCount}` : copy.initial}</span>{result && <small>{GAMES.find(game => game.id === appId)?.name}</small>}</div>
      <strong data-inventory-total>{money(selected.totalCents)}</strong>
      {result ? <>
        <dl className={styles.totals}><div><dt>{copy.total}</dt><dd>{money(result.summary.totalCents)}</dd></div><div><dt>{copy.items}</dt><dd>{result.summary.itemCount}</dd></div>{result.summary.unpricedCount > 0 && <div><dt>{copy.unpriced}</dt><dd>{result.summary.unpricedCount}</dd></div>}</dl>
        {result.warnings.map(warning => <p key={warning} className={styles.warning}>{copy.warnings[warning]} {['ARCHIVE_PRICES', 'CACHED_PRICES'].includes(warning) ? date(result.pricing.updatedAt) : ''}</p>)}
        <p className={styles.estimate}>{copy.estimate}</p>
      </> : <p className={styles.estimate}>{copy.initialHint}</p>}
      <div className={styles.paymentLabel}>{copy.paymentMethods}</div>
      <div className={base.payoutMethods}>{payoutMethods.map(([image, label]) => <div key={image}><img src={`/assets/payment-methods/${image}`} alt={label}/>{label === 'Balance' && <span>ϟ</span>}</div>)}</div>
      {result?.pricing.updatedAt && <div className={styles.source}><a href="https://skinport.com/market" target="_blank" rel="noopener noreferrer">{result.pricing.source === 'archive' ? copy.archiveSource : copy.priceSource}</a><span>{copy.updated}: {date(result.pricing.updatedAt)}</span>{result.exchangeRateProvider && <a href={result.exchangeRateProvider} target="_blank" rel="noopener noreferrer">Rates by ExchangeRate-API</a>}</div>}
    </aside>
  </section>;
}
