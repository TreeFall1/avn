'use client';

import { useEffect, useRef } from 'react';
import { formatInventoryMoney } from '../lib/inventory.mjs';
import { formatPayoutDate } from '../lib/payout.mjs';
import { tradeCopy } from '../data/trade-copy';
import styles from './TradeConfirmation.module.scss';

export default function TradeConfirmation({ deal, locale, onBack }) {
  const copy = tradeCopy[locale];
  const headingRef = useRef(null);
  const rows = [copy.botRegistered, copy.botId, copy.code, copy.number];
  const amount = formatInventoryMoney(deal.totalCents, deal.currency, locale);
  const payoutDate = formatPayoutDate(deal.createdAt, locale);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return <section className={styles.section} data-trade-confirmation aria-labelledby="trade-confirmation-title">
    <ol className={styles.steps} aria-label={locale === 'ru' ? 'Этапы сделки' : 'Trade steps'}>
      {copy.steps.map((step, index) => <li key={step} aria-current={index === 0 ? 'step' : undefined}>
        <span className={styles.stepNumber}>{index + 1}</span><span>{step}</span>
      </li>)}
    </ol>
    <div className={styles.card}>
      <div className={styles.information}>
        <h1 ref={headingRef} tabIndex={-1} id="trade-confirmation-title">{copy.title}</h1>
        <p className={styles.subtitle}>{copy.subtitle}</p>
        <dl className={styles.details}>
          <div><dt>{copy.amount}:</dt><dd className={styles.amount} data-trade-amount>{amount}</dd></div>
          {rows.map(label => <div key={label}><dt>{label}:</dt><dd aria-label={copy.awaiting}>—</dd></div>)}
        </dl>
        <div className={styles.payoutNote}>{copy.payout} <strong data-trade-payout-date>{payoutDate}</strong></div>
        <p className={styles.pending} id="trade-pending" role="status">{copy.pending}</p>
        <div className={styles.deadline}><span>{copy.deadline}:</span><span className={styles.timer} aria-label={copy.awaiting}>— <b>:</b> —</span></div>
        <button type="button" className={styles.confirm} disabled aria-describedby="trade-pending">{copy.confirm}</button>
        <button type="button" className={styles.back} onClick={onBack}>← {copy.back}</button>
      </div>
      <div className={styles.illustration}>
        <p className={styles.phoneCaption}>{copy.phoneCaption}</p>
        <div className={styles.phone} aria-hidden="true">
          <div className={styles.phoneTop}><span>9:41</span><i/><span>▮▮▮ ▰</span></div>
          <div className={styles.phoneHeading}><span>☰</span>{copy.phoneTitle}</div>
          <div className={styles.phoneAccount}><img src="/assets/icons/steam-logo.svg" alt=""/><span>{copy.phoneAccount}</span></div>
          <div className={styles.phoneNotice}><b>!</b><span>{copy.phoneNotice}</span></div>
          <div className={styles.phoneRow}><span>ⓘ</span><div>{copy.botId}<strong>—</strong></div></div>
          <div className={styles.phoneRow}><span>▣</span><div>{copy.phoneDate}<strong>—</strong></div></div>
          <div className={styles.phoneRow}><span>⌘</span><div>{copy.phoneCode}<strong>—</strong></div></div>
          <div className={styles.phoneWaiting}>{copy.noOffer}</div>
        </div>
      </div>
    </div>
    <p className={styles.preview}>{copy.preview}</p>
  </section>;
}
