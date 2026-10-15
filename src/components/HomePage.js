'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { articleImages, content } from '../data/content';
import { calculateCounters, COUNTER_EPOCH, initialCounters } from '../data/counters';
import reference from '../data/reference-content.json';
import styles from './HomePage.module.scss';
import Inventory from './Inventory';

const media = '/media/';
const logo = `${media}logo.0qvx4qrdl15cs.svg`;
const logoSmall = `${media}avan-small.0gwe_tog6gl-g.svg`;
const heroItems = reference.hero.map((item, index) => ({ ...item, amount: [650103, 20575, 586451, 883][index] }));
const LIVE_INTERVAL_MS = 12_000;
const LIVE_SLIDE_MS = 4_000;
const liveSource = reference.live;
const paymentMethods = [
  ['sbp', 'СБП'], ['cards', 'Cards'], ['btc', 'BTC'], ['eth', 'ETH'],
  ['bankTransfer', 'Bank Transfer'], ['usdt', 'USDT'], ['ltc', 'Litecoin'],
  ['gram', 'Gram'], ['paypal', 'PayPal'], ['bnb', 'BNB'],
];
const currencies = [
  ['RUB', '₽', 1], ['USD', '$', 0.0125], ['UAH', '₴', 0.52],
  ['BYN', 'Br', 0.041], ['KZT', '₸', 6.4], ['EUR', '€', 0.0116],
];

function formatted(amount, currency, locale) {
  const selected = currencies.find(([code]) => code === currency) || currencies[0];
  const value = amount * selected[2];
  const digits = currency === 'RUB' || currency === 'KZT' ? 0 : 2;
  return `${new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)} ${selected[1]}`;
}

function formattedLive(amount, currency, locale) {
  const selected = currencies.find(([code]) => code === currency) || currencies[0];
  return `${new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount * selected[2])} ${selected[1]}`;
}

function liveSale(id) {
  const index = ((id % liveSource.length) + liveSource.length) % liveSource.length;
  return { ...liveSource[index], id, soldAt: COUNTER_EPOCH + id * LIVE_INTERVAL_MS };
}

function liveSnapshot(tick) {
  return Array.from({ length: liveSource.length }, (_, index) => liveSale(tick - index));
}

function liveAge(soldAt, now, locale) {
  const seconds = Math.max(1, Math.floor((now - soldAt) / 1000));
  if (seconds < 60) return locale === 'ru' ? `${seconds} сек. назад` : `${seconds} sec. ago`;
  const minutes = Math.floor(seconds / 60);
  return locale === 'ru' ? `${minutes} мин. назад` : `${minutes} min. ago`;
}

function inactive(event) {
  event?.preventDefault?.();
}

function openInventory() {
  document.getElementById('inventory')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

function useSyncedTime() {
  const [now, setNow] = useState(COUNTER_EPOCH);
  useEffect(() => {
    let active = true;
    let reference = null;
    const sync = async () => {
      const started = performance.now();
      try {
        const response = await fetch('/api/time', { cache: 'no-store' });
        if (!response.ok) throw new Error('Time service unavailable');
        const { now: serverNow } = await response.json();
        const received = performance.now();
        reference = { time: serverNow + (received - started) / 2, performanceTime: received };
      } catch {
        reference = { time: Date.now(), performanceTime: performance.now() };
      }
      if (active) setNow(reference.time);
    };
    sync();
    const tick = setInterval(() => {
      if (reference) setNow(reference.time + performance.now() - reference.performanceTime);
    }, 1000);
    const resync = setInterval(sync, 5 * 60 * 1000);
    return () => { active = false; clearInterval(tick); clearInterval(resync); };
  }, []);
  return now;
}

function Icon({ name, size = 22 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
    menu: <><path d="M3 5h18M3 12h18M3 19h18"/></>,
    close: <><path d="M5 5l14 14M19 5 5 19"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M19 20v-2a6 6 0 0 0-3-5"/></>,
    message: <><path d="M20 11a8 8 0 0 1-8 8H5l1.5-3A8 8 0 1 1 20 11Z"/><path d="M8 10h8m-8 3h5"/></>,
    wallet: <><rect x="2" y="5" width="20" height="15" rx="2"/><path d="M2 9h20M17 15h2"/></>,
    box: <><path d="M3 7 12 3l9 4v10l-9 4-9-4Z"/><path d="M3 7l9 4 9-4M12 11v10"/></>,
    check: <><path d="M12 2 15 4l3.6.4.4 3.6 2 3-2 3-.4 3.6-3.6.4-3 2-3-2-3.6-.4-.4-3.6-2-3 2-3 .4-3.6L9 4Z"/><path d="m8 12 2.5 2.5L16 9"/></>,
    gift: <><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M2 8h20M12 8v13M12 8c-7-1-7-6-4-6 2 0 4 3 4 6Zm0 0c7-1 7-6 4-6-2 0-4 3-4 6Z"/></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4"/></>,
    download: <><path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function Header({ t, locale, currency, setCurrency }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdown, setDropdown] = useState('');
  const [notice, setNotice] = useState(false);
  const languagePath = locale === 'ru' ? '/en' : '/ru';

  useEffect(() => { setDropdown(''); setMenuOpen(false); }, [locale]);

  return <header className={styles.header}>
    <button className={styles.burger} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'close' : 'menu'} size={27}/></button>
    <a href={locale === 'ru' ? '/' : '/en'} className={styles.logo} aria-label="Avan Market"><img src={logo} alt="avanmarket"/></a>
    <nav className={styles.desktopNav} aria-label="Main navigation">
      {t.nav.map((item, index) => index === 3 ?
        <div className={styles.dropdownRoot} key={item}><button className={styles.navButton} onClick={() => setDropdown(dropdown === 'useful' ? '' : 'useful')} aria-expanded={dropdown === 'useful'}>{item}<Icon name="chevron" size={15}/></button>{dropdown === 'useful' && <div className={styles.dropdownMenu}>{t.useful.map((v, i) => <button key={v} onClick={() => { setDropdown(''); if (i === 2) openInventory(); }}>{v}</button>)}</div>}</div>
        : <button key={item} className={`${styles.navButton} ${index === 0 ? styles.activeNav : ''}`} onClick={index === 0 ? openInventory : inactive}>{item}</button>)}
    </nav>
    <div className={styles.headerActions}>
      <div className={`${styles.dropdownRoot} ${styles.desktopControl}`}><button className={styles.headerSelect} aria-expanded={dropdown === 'language'} onClick={() => setDropdown(dropdown === 'language' ? '' : 'language')}><img className={styles.headerFlag} src={`/assets/icons/flags/${locale === 'ru' ? 'RUS' : 'ENG'}.svg`} alt={locale === 'ru' ? 'Русский' : 'English'}/><Icon name="chevron" size={14}/></button>{dropdown === 'language' && <div className={styles.dropdownMenu}><a href="/ru">RUS</a><a href="/en">ENG</a></div>}</div>
      <div className={`${styles.dropdownRoot} ${styles.desktopControl}`}><button className={styles.headerSelect} aria-expanded={dropdown === 'currency'} onClick={() => setDropdown(dropdown === 'currency' ? '' : 'currency')}><strong>{currencies.find(c => c[0] === currency)?.[1]}</strong><Icon name="chevron" size={14}/></button>{dropdown === 'currency' && <div className={styles.dropdownMenu}>{currencies.map(([code, symbol]) => <button key={code} onClick={() => { setCurrency(code); setDropdown(''); }}>{symbol} {code}</button>)}</div>}</div>
      <div className={styles.dropdownRoot}><button className={styles.notification} aria-label="Notifications" aria-expanded={notice} onClick={() => setNotice(!notice)}><Icon name="bell" size={17}/></button>{notice && <div className={styles.noticeMenu}>{locale === 'ru' ? 'Нет новых уведомлений' : 'No new notifications'}</div>}</div>
      <button className={styles.steamButton} onClick={inactive}><img src="/assets/icons/steam-logo.svg" alt=""/><span>{t.signIn}</span></button>
    </div>
    {menuOpen && <div className={styles.mobileMenu}>
      {t.nav.map((item, i) => <button key={item} onClick={() => { if (i === 3) setDropdown(dropdown === 'mobileUseful' ? '' : 'mobileUseful'); if (i === 0) { setMenuOpen(false); openInventory(); } }}>{item}{i === 3 && <Icon name="chevron" size={16}/>}</button>)}
      {dropdown === 'mobileUseful' && t.useful.map((item, i) => <button className={styles.mobileSubitem} key={item} onClick={() => { if (i === 2) { setMenuOpen(false); setDropdown(''); openInventory(); } }}>{item}</button>)}
      <div className={styles.mobileSettings}><select value={currency} aria-label="Currency" onChange={e => setCurrency(e.target.value)}>{currencies.map(c => <option key={c[0]} value={c[0]}>{c[1]} {c[0]}</option>)}</select><a href={languagePath}>{locale === 'ru' ? 'ENG' : 'RUS'}</a></div>
    </div>}
  </header>;
}

function Hero({ t, currency, locale }) {
  const labels = [['★ M9 Bayonet', 'Doppler Ruby'], ['M4A1-S', 'Printstream'], ['★ Sport Gloves', 'Hedge Maze'], ['AK-47', 'The Outsiders']];
  const trust = <div className={styles.trustpilot}><span>Excellent</span><span className={styles.trustStars}>★★★★★</span><small><u>1,768 reviews on</u> <b>★</b>Trustpilot</small></div>;
  return <section className={styles.hero}>
    <div className={styles.heroArt} aria-label="Popular game items">
      <div className={styles.heroCardsVisual}>
      {heroItems.map((item, index) => <div className={`${styles.heroCard} ${styles[`heroCard${index}`]}`} key={item.name}>
        <div className={styles.heroCardTop}>{item.quality === 'Factory New' ? 'FN' : 'MW'}</div>
        <img src={item.image} alt={item.name}/>
        <div className={styles.heroCardBottom}><strong>{formatted(item.amount, currency, locale)}</strong><small>{labels[index][0]}</small><span>{labels[index][1]}</span></div>
      </div>)}
      </div>
      <div className={styles.mobileTrust}>{trust}</div>
    </div>
    <div className={styles.heroText}>
      <h1>{t.heroTitle}<br/>{t.skins} <span className={styles.heroGame}><span className={styles.heroGameList} aria-label="CS2, Dota 2, Rust, TF2">{['CS2', 'Dota 2', 'Rust', 'TF2', 'CS2'].map((name, index) => <span key={`${name}-${index}`}>{name}</span>)}</span></span></h1>
      <div className={styles.desktopTrust}>{trust}</div>
      <p>{t.heroCopy}</p>
      <div className={styles.heroButtons}><button className={styles.yellowButton} onClick={openInventory}><img src="/assets/icons/walletMain.svg" alt=""/>{t.sell}</button><button className={styles.darkButton} onClick={inactive}><img src="/assets/icons/cartWhite.svg" alt=""/>{t.buy}</button></div>
    </div>
  </section>;
}

function Benefits({ t }) {
  return <section className={styles.benefits}>{t.benefits.map(([title, body], index) => <article key={title}><div className={styles.benefitIcon}><img src={`/assets/icons/benefit-${index + 1}.svg`} alt=""/></div><div><h2>{title}</h2><p>{body}</p></div></article>)}</section>;
}

function PaymentMethods() {
  return <div className={styles.paymentStrip}><div className={styles.paymentStripTrack}>{paymentMethods.map(([icon, label]) => <div className={styles.paymentStripItem} key={label}><img src={`/assets/icons/paymentMethodsMainPage/${icon}.svg`} alt=""/><span>{label}</span></div>)}</div></div>;
}

function LiveFeed({ t, locale, currency, counters, now }) {
  const tick = Math.max(0, Math.floor((now - COUNTER_EPOCH) / LIVE_INTERVAL_MS));
  const [sales, setSales] = useState(() => liveSnapshot(0));
  const [slide, setSlide] = useState(0);
  const [transition, setTransition] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const seenTick = useRef(0);
  const resumeFrame = useRef(0);
  const pause = useRef(false);

  const resumeTransition = () => {
    cancelAnimationFrame(resumeFrame.current);
    resumeFrame.current = requestAnimationFrame(() => {
      resumeFrame.current = requestAnimationFrame(() => setTransition(true));
    });
  };

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const previous = seenTick.current;
    if (tick === previous) return;
    seenTick.current = tick;
    setTransition(false);
    if (tick - previous === 1) {
      setSales(current => [liveSale(tick), ...current.slice(0, -1)]);
      setSlide(current => current < sales.length - 1 ? current + 1 : 0);
    } else {
      setSales(liveSnapshot(tick));
      setSlide(0);
    }
    resumeTransition();
  }, [tick, sales.length]);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = setInterval(() => {
      if (!pause.current) setSlide(current => current < sales.length ? current + 1 : current);
    }, LIVE_SLIDE_MS);
    return () => clearInterval(timer);
  }, [reducedMotion, sales.length]);

  useEffect(() => () => cancelAnimationFrame(resumeFrame.current), []);

  const colors = ['#eb4b4b', '#4b69ff', '#d32ce6', '#b0c3d9', '#e4ae39'];
  const renderItems = (copy) => sales.map((entry) => <div className={styles.liveCard} key={`${copy}-${entry.id}`} style={{ '--rarity': colors[((entry.id % colors.length) + colors.length) % colors.length] }}><div className={styles.liveCardTop}><span>{liveAge(entry.soldAt, now, locale)}</span>{entry.quality && <b>{entry.quality}</b>}</div><img src={entry.image} alt={entry.name}/><p title={entry.name}>{entry.name}</p><div className={styles.liveCardFooter}><strong>{formattedLive(entry.amount, currency, locale)}</strong><img src={`/assets/carousel/${entry.quality ? 'coin' : 'gun'}.svg`} alt=""/></div></div>);
  return <section className={styles.liveSection}>
    <div className={styles.liveHeading}><h2><img src="/assets/carousel/indicator-live.svg" alt=""/>{t.live}</h2><p>{t.totalSold} <strong>{new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US').format(counters.liveSold)}</strong></p></div>
    <div className={styles.liveViewport} onPointerEnter={() => { pause.current = true; }} onPointerLeave={() => { pause.current = false; }} onFocusCapture={() => { pause.current = true; }} onBlurCapture={() => { pause.current = false; }}><div className={`${styles.liveTrack} ${!transition || reducedMotion ? styles.liveTrackInstant : ''}`} style={{ '--live-slide': slide }} onTransitionEnd={event => { if (event.target !== event.currentTarget || event.propertyName !== 'transform' || slide < sales.length) return; setTransition(false); setSlide(0); resumeTransition(); }}><div className={styles.liveGroup}>{renderItems(0)}</div><div className={styles.liveGroup} aria-hidden="true">{renderItems(1)}</div></div></div>
  </section>;
}

function Growth({ t }) {
  return <section className={styles.growth}>
    <div className={styles.growthText}><h2>{t.growthTitle}</h2><p className={styles.growthLead}>{t.growthLead}</p><p className={styles.growthCopy}>{t.growthCopy}</p><button className={styles.yellowButton} onClick={inactive}>{t.letsGo}</button></div>
    <div className={styles.growthArt} aria-hidden="true"><div className={styles.growthLines}><svg viewBox="0 0 520 290" preserveAspectRatio="none"><path d="M15 230 L135 150 L270 145 L350 140 L475 50" fill="none" stroke="#20f778" strokeWidth="3"/><circle cx="15" cy="230" r="6" fill="#20f778"/><circle cx="475" cy="50" r="9" fill="#20f778"/></svg></div><img className={styles.graphBee} src="/assets/images/bee.webp" alt=""/><img className={styles.graphCoin1} src="/assets/images/coin.webp" alt=""/><img className={styles.graphCoin2} src="/assets/images/coin.webp" alt=""/><div className={styles.graphSkin}><div className={styles.graphSkinTop}><span/>MW</div><img src="/assets/images/gunForGraph.png" alt=""/><p>AK-47 | Vulcan</p><strong>0₽</strong><b>+ 600₽</b></div><div className={styles.graphDay}>{t.day8}</div></div>
  </section>;
}

function Reviews({ t, locale, counters }) {
  const reviews = reference.reviews.slice(0, 16);
  return <section className={styles.reviewsSection}><div className={styles.sectionHeading}><h2>{t.reviewsCount} {new Intl.NumberFormat('de-DE').format(counters.reviews)} {t.reviewsUnit}</h2><div className={styles.reviewsTrust}>Excellent <span className={styles.trustStars}>★★★★★</span> <u>1,768 reviews on</u> <b>★</b>Trustpilot</div><p className={styles.siteRating}>{t.siteRating} <strong>★ 5/5</strong></p></div><div className={styles.reviewGrid}>{reviews.map((review, index) => <article className={styles.reviewCard} key={index}><div className={styles.reviewPerson}><img src={review.avatar} alt=""/><h3>{review.name}</h3></div><p>{review.comment}</p><div className={styles.reviewRating}><img src="/assets/icons/star.svg" alt=""/><strong>{review.rating} {locale === 'ru' ? 'из' : 'out of'} 5</strong><small>{locale === 'ru' ? 'на AvanMarket' : 'on AvanMarket'}</small></div></article>)}</div></section>;
}

function Media({ t, locale }) {
  const [showAll, setShowAll] = useState(false);
  return <section className={styles.mediaSection}><div className={styles.sectionHeading}><h2>{t.mediaTitle}</h2><p>{t.mediaCopy}</p></div><div className={`${styles.creatorGrid} ${showAll ? styles.creatorGridExpanded : ''}`}>{reference.creators.map((creator) => <button className={styles.creatorCard} key={creator.name} onClick={inactive}><img src={creator.image} alt=""/><div className={styles.creatorInfo}><strong>{creator.name}</strong><span><img src={creator.social} alt=""/>{locale === 'ru' ? creator.count : creator.count.replace('тыс.', 'k.').replace('млн.', 'mln.')}</span></div></button>)}</div><button className={styles.mediaMore} onClick={() => setShowAll(value => !value)}>{showAll ? (locale === 'ru' ? 'Свернуть' : 'Collapse') : t.showAll}</button></section>;
}

function Statistics({ t, locale, currency, counters }) {
  const values = [counters.items, counters.purchased, counters.reviews, counters.partners];
  return <section className={styles.statsSection}>{values.map((value, i) => <div className={styles.statCard} key={i}><div className={styles.statIcon}><Icon name={['upload', 'download', 'message', 'wallet'][i]} size={24}/></div><strong>{i === 3 ? formatted(value, currency, locale) : new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US').format(Math.round(value))}</strong><p>{t.statLabels[i]}</p></div>)}</section>;
}

function FAQ({ t }) {
  const [open, setOpen] = useState(-1);
  return <section className={styles.faqSection}>{t.faq.map(([question, answer], i) => <div className={styles.faqItem} key={question}><button aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}><span>{question}</span><Icon name="chevron" size={21}/></button>{open === i && <div className={styles.faqAnswer}>{answer}</div>}</div>)}</section>;
}

function Articles({ t }) {
  const ref = useRef(null);
  return <section className={styles.articlesSection}><div className={styles.articlesHeading}><h2><span>▣</span>{t.articlesTitle}</h2><button onClick={() => ref.current?.scrollBy({ left: 360, behavior: 'smooth' })}>{t.showAll}<Icon name="arrow" size={18}/></button></div><div className={styles.articleRail} ref={ref}>{t.articles.map(([date, title], i) => <article className={styles.articleCard} key={title}><button onClick={inactive} aria-label={title}><img src={articleImages[i]} alt=""/></button><time>{date}</time><h3>{title}</h3></article>)}</div></section>;
}

function Footer({ t, locale }) {
  const [open, setOpen] = useState(-1);
  return <footer className={styles.footer}><div className={styles.footerColumns}>{t.footer.map(([title, ...items], i) => <div className={styles.footerColumn} key={title}><button className={styles.footerHeading} onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>{title}<Icon name="chevron" size={16}/></button><div className={`${styles.footerLinks} ${open === i ? styles.footerLinksOpen : ''}`}>{i === 5 ? <div className={styles.socials}>{items.map((item, index) => <button key={item} aria-label={item} onClick={inactive}>{['ᴠκ', '▶', '➤', '♪', '◎'][index]}</button>)}</div> : items.map((item, index) => <button key={item} onClick={i === 3 && index === 0 ? openInventory : inactive}>{item}</button>)}</div></div>)}</div><div className={styles.footerBottom}><img src={logoSmall} alt="Avan Market"/><div><div className={styles.legalLinks}>{t.legal.map(item => <button onClick={inactive} key={item}>{item}</button>)}</div><p>© 2026 Avanmarket. All Rights Reserved.</p></div><div className={styles.payments}>VISA <span>●●</span> ₿ ◆ ₮ ◈ ℗</div></div><div className={styles.company}>Digital Black Horizon - FZCO · License number 37185 · Building A1, Dubai Digital Park, Dubai Silicon Oasis, Dubai, United Arab Emirates</div></footer>;
}

function ChatWidget({ locale }) {
  const [open, setOpen] = useState(false);
  const help = locale === 'ru' ? 'Напишите нам, мы онлайн!' : 'Message us, we are online!';
  return <div className={`${styles.chatWidget} ${open ? styles.chatWidgetOpen : ''}`}>
    {open && <div className={styles.chatPanel}><div><strong>{locale === 'ru' ? 'Помощь Avan Market' : 'Avan Market help'}</strong><button aria-label={locale === 'ru' ? 'Закрыть' : 'Close'} onClick={() => setOpen(false)}><Icon name="close" size={18}/></button></div><p>{locale === 'ru' ? 'Ответы на частые вопросы находятся ниже на странице.' : 'Answers to common questions are further down this page.'}</p><button className={styles.chatFaq} onClick={() => { setOpen(false); document.querySelector(`.${styles.faqSection}`)?.scrollIntoView({ behavior: 'smooth' }); }}>{locale === 'ru' ? 'Перейти к вопросам' : 'Go to questions'}</button></div>}
    <button className={styles.chatBar} aria-expanded={open} onClick={() => setOpen(value => !value)}><span>{help}</span><i/></button>
  </div>;
}

function WelcomeModal({ t, locale, close }) {
  const [slide, setSlide] = useState(0);
  const data = t.modal[slide];
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return <div className={styles.modalOverlay} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={styles.modal} role="dialog" aria-modal="true" aria-label={data.title.replace('\n', ' ')}>
      <button className={styles.modalClose} aria-label="Close" onClick={close}><Icon name="close" size={22}/></button>
      <div className={`${styles.modalArt} ${styles[`modalArtSlide${slide}`]}`}>
        {slide === 0 && <><img className={styles.flash} src="/assets/images/lightning.webp" alt=""/><img className={styles.modalBee} src="/assets/images/beeHappy.svg" alt=""/><img className={styles.modalCoin} src="/assets/images/dollar.webp" alt=""/><img className={styles.modalCoinLeft} src="/assets/images/dollar.webp" alt=""/></>}
        {slide === 1 && <div className={styles.modalGraphArt}><svg viewBox="0 0 620 290" preserveAspectRatio="none" aria-hidden="true"><path d="M0 245 100 175 230 132 350 135 500 88 600 10" fill="none" stroke="#24ed77" strokeWidth="3"/><circle cx="100" cy="175" r="6" fill="#24ed77"/><circle cx="600" cy="10" r="8" fill="#24ed77"/></svg><img className={styles.modalGraphBee} src="/assets/images/bee.webp" alt=""/><div className={styles.modalGraphCard}><span>MW</span><img src="/assets/images/gunForGraph.png" alt=""/><p>AK-47 | Vulcan</p><strong>27 576₽</strong><b>+ 600₽</b></div></div>}
        {slide === 2 && <div className={styles.modalKycArt}><div className={styles.modalKycCard}><img src="/assets/images/authentication.webp" alt=""/><strong>{locale === 'ru' ? 'Пройдите KYC' : 'Pass KYC'}</strong><span/><span/><div>▣ ━━━━━━━━━</div></div></div>}
      </div>
      <div className={styles.modalSteps}>{t.modal.map((_, i) => <span className={i <= slide ? styles.activeStep : ''} key={i}/>)}</div>
      <div className={styles.modalBody}><h2>{data.title.split('\n').map((line, i) => <span key={line}>{i > 0 && <br/>}{line.includes(data.highlight) ? <>{line.split(data.highlight)[0]}<em className={styles.modalHighlight}>{data.highlight}</em>{line.split(data.highlight)[1]}</> : line}</span>)}</h2><p>{data.body}</p>{data.note && <p className={styles.modalNote}>{data.note}</p>}<button className={styles.yellowButton} onClick={() => slide < t.modal.length - 1 ? setSlide(slide + 1) : close()}>{data.button}</button></div>
    </div>
  </div>;
}

export default function HomePage({ locale = 'ru' }) {
  const t = content[locale];
  const pathname = usePathname();
  const [currency, setCurrency] = useState(locale === 'ru' ? 'RUB' : 'USD');
  const [modal, setModal] = useState(false);
  const now = useSyncedTime();
  const counters = now === COUNTER_EPOCH ? initialCounters : calculateCounters(now);
  useEffect(() => {
    const remembered = window.sessionStorage.getItem('avan-welcome-seen');
    if (!remembered) setModal(true);
  }, []);
  useEffect(() => { setCurrency(locale === 'ru' ? 'RUB' : 'USD'); document.documentElement.lang = locale; }, [locale, pathname]);
  const closeModal = () => { setModal(false); window.sessionStorage.setItem('avan-welcome-seen', '1'); };
  return <div className={styles.site}><Header t={t} locale={locale} currency={currency} setCurrency={setCurrency}/><main><Hero t={t} currency={currency} locale={locale}/><Benefits t={t}/><PaymentMethods/><Inventory t={t} currency={currency} locale={locale}/><LiveFeed t={t} locale={locale} currency={currency} counters={counters} now={now}/><Statistics t={t} locale={locale} currency={currency} counters={counters}/><Reviews t={t} locale={locale} counters={counters}/><Media t={t} locale={locale}/><Articles t={t}/><FAQ t={t}/></main><Footer t={t} locale={locale}/><ChatWidget locale={locale}/>{modal && <WelcomeModal t={t} locale={locale} close={closeModal}/>}</div>;
}
