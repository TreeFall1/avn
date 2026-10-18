'use client';

import { useRef, useState } from 'react';
import { PAYOUT_METHODS, canSelectPayout, formatPayoutDate, validatePayoutFields } from '../lib/payout.mjs';
import { formatInventoryMoney } from '../lib/inventory.mjs';
import { payoutCopy } from '../data/payout-copy';
import styles from './PayoutForm.module.scss';

const BANKS = ['Сбербанк', 'Т-Банк', 'Альфа-Банк', 'ВТБ', 'Газпромбанк', 'Райффайзенбанк', 'Ozon Банк', 'Совкомбанк', 'МТС Банк', 'Россельхозбанк'];
const fieldTypes = { email: 'email', phone: 'tel', steamProfile: 'url' };
const fieldAutocomplete = { email: 'email', phone: 'tel', fullName: 'name', card: 'cc-number' };

export default function PayoutForm({ totalCents, minimumCents, currency, locale, disabled, steamId, now, onPrepare }) {
  const copy = payoutCopy[locale];
  const [methodId, setMethodId] = useState(null);
  const [details, setDetails] = useState({});
  const [errors, setErrors] = useState({});
  const [bankOption, setBankOption] = useState('');
  const formRef = useRef(null);
  const chooserRef = useRef(null);
  const focusMethod = useRef(null);
  const available = !disabled && canSelectPayout(totalCents, minimumCents);
  const method = available ? PAYOUT_METHODS.find(entry => entry.id === methodId) : null;
  const fields = details[methodId] || (methodId === 'steam' && steamId ? { steamProfile: `https://steamcommunity.com/profiles/${steamId}/` } : {});
  const money = cents => formatInventoryMoney(cents, currency, locale);
  const payoutDate = formatPayoutDate(now, locale);

  function choose(id) {
    if (!available) return;
    focusMethod.current = id;
    setMethodId(id);
    setErrors({});
    requestAnimationFrame(() => formRef.current?.querySelector('input')?.focus({ preventScroll: true }));
  }

  function update(field, value) {
    if (field === 'card') value = value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
    if (field === 'iban') value = value.replace(/\s/g, '').toUpperCase().slice(0, 34).replace(/(.{4})/g, '$1 ').trim();
    setDetails(previous => ({ ...previous, [methodId]: { ...fields, [field]: value } }));
    setErrors(previous => ({ ...previous, [field]: undefined }));
  }

  function submit(event) {
    event.preventDefault();
    if (!available) return;
    const nextErrors = validatePayoutFields(methodId, fields);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    onPrepare?.({ totalCents, currency, methodId, createdAt: now });
  }

  return <div className={styles.payout}>
    {!method ? <>
      <p className={styles.label}>{copy.choose}</p>
      <div ref={chooserRef} className={styles.methods} role="group" aria-label={copy.methods}>
        {PAYOUT_METHODS.map(entry => <button type="button" key={entry.id} data-payout-method={entry.id} disabled={!available} onClick={() => choose(entry.id)} aria-label={entry.label} aria-describedby={`fee-${entry.id}${!available ? ' payout-minimum' : ''}`}>
          <img src={`/assets/payment-methods/${entry.image}`} alt=""/>
          <span className={styles.tooltip} id={`fee-${entry.id}`} role="tooltip">{copy.fee}</span>
        </button>)}
      </div>
      {!available && <p className={styles.hint} id="payout-minimum" role="status">{copy.minimum}</p>}
      <p className={styles.hint}>{copy.fee}</p>
    </> : <form ref={formRef} className={styles.form} onSubmit={submit} noValidate aria-label={`${copy.methods}: ${method.label}`}>
      <div className={styles.methodHeading}>
        <button type="button" className={styles.change} onClick={() => {
          setMethodId(null); setErrors({});
          requestAnimationFrame(() => chooserRef.current?.querySelector(`[data-payout-method="${focusMethod.current}"]`)?.focus({ preventScroll: true }));
        }}><span aria-hidden="true">←</span>{copy.change}</button>
        <div className={styles.selectedMethod} aria-label={method.label} tabIndex={0} aria-describedby="selected-payout-fee"><img src={`/assets/payment-methods/${method.image}`} alt={method.label}/><span className={styles.tooltip} id="selected-payout-fee" role="tooltip">{copy.fee}</span></div>
      </div>
      {method.network && <p className={styles.network}>{copy.network}: <strong>{method.network}</strong></p>}
      <div className={styles.fields}>
        {method.fields.map(field => {
          const id = `payout-${method.id}-${field}`;
          const isBank = field === 'bank';
          const wide = field === 'wallet' || field === 'fullName' || field === 'steamProfile' || isBank || method.fields.length <= 2;
          const common = { id, name: field, required: true, 'aria-invalid': Boolean(errors[field]), 'aria-describedby': errors[field] ? `${id}-error` : undefined };
          return <div key={field} className={`${styles.field} ${wide ? styles.wide : ''}`}>
            <label htmlFor={id}>{copy.labels[field]}</label>
            {isBank ? <>
              <select {...common} aria-invalid={Boolean(errors[field]) && bankOption !== 'other'} value={bankOption} onChange={event => { setBankOption(event.target.value); update('bank', event.target.value === 'other' ? '' : event.target.value); }}>
                <option value="" disabled>{copy.bankPlaceholder}</option>
                {BANKS.map(bank => <option value={bank} key={bank}>{bank}</option>)}
                <option value="other">{copy.otherBank}</option>
              </select>
              {bankOption === 'other' && <input aria-label={copy.otherBank} aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `${id}-error` : undefined} name="otherBank" value={fields.bank || ''} placeholder={copy.bankPlaceholder} maxLength={100} onChange={event => update('bank', event.target.value)} required/>}
            </> : <input
              {...common} type={fieldTypes[field] || 'text'} value={fields[field] || ''}
              onChange={event => update(field, event.target.value)} autoComplete={fieldAutocomplete[field] || 'off'}
              inputMode={field === 'card' ? 'numeric' : undefined} spellCheck={false}
              maxLength={field === 'card' ? 23 : field === 'iban' ? 42 : field === 'wallet' ? 128 : 254}
              placeholder={field === 'phone' ? '+7 (9__) ___-__-__' : field === 'wallet' ? (method.address === 'evm' ? '0x…' : method.address === 'tron' ? 'T…' : '') : ''}
            />}
            {errors[field] && <span className={styles.error} id={`${id}-error`}>{copy.errors[errors[field]]}</span>}
          </div>;
        })}
      </div>
      {totalCents > 0 && <div className={styles.date}>{copy.payoutDate}: <strong>{payoutDate}</strong></div>}
      <div className={styles.footer}>
        <button className={styles.receive} type="submit" disabled={!available}>{copy.receive} <span data-payout-amount>{money(totalCents)}</span></button>
        <p className={styles.commission}>{copy.fee}</p>
        <p className={styles.hint}>{copy.calculateOnly}</p>
      </div>
    </form>}
  </div>;
}
