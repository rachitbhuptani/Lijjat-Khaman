'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
const state = {
  quotes:       {},     // symbol → Yahoo Finance quote object
  news:         [],     // deduplicated news array
  lastUpdated:  null,
  refreshTimer: null,
  sortCol:      'changePercent',
  sortDir:      -1,     // -1 = descending, 1 = ascending
  newsFilter:   'all',  // 'all' | sector name | stock symbol
  searchQuery:  '',
  sectorFilter: 'all',
  loading:      false,
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTOR COLOURS
// ─────────────────────────────────────────────────────────────────────────────
const SECTOR_COLORS = {
  'IT':       '#818cf8',
  'Banking':  '#38bdf8',
  'NBFC':     '#22d3ee',
  'Energy':   '#fb923c',
  'FMCG':     '#34d399',
  'Pharma':   '#f472b6',
  'Auto':     '#facc15',
  'Metals':   '#a78bfa',
  'Realty':   '#86efac',
  'Telecom':  '#f87171',
  'Cement':   '#d1d5db',
  'Power':    '#fcd34d',
};

function sectorColor(sector) {
  return SECTOR_COLORS[sector] || '#94a3b8';
}

// ─────────────────────────────────────────────────────────────────────────────
// API  (Yahoo Finance — works directly from browser with no auth)
// ─────────────────────────────────────────────────────────────────────────────
const YF = 'https://query2.finance.yahoo.com';
const PROXY = 'https://corsproxy.io/?url=';

async function yfFetch(url) {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  } catch {
    // CORS proxy fallback
    const r2 = await fetch(PROXY + encodeURIComponent(url));
    if (!r2.ok) throw new Error('proxy ' + r2.status);
    return r2.json();
  }
}

async function fetchQuotes(symbols) {
  const sym = symbols.join(',');
  const fields = [
    'symbol', 'longName', 'shortName',
    'regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent',
    'regularMarketVolume', 'regularMarketDayHigh', 'regularMarketDayLow',
    'regularMarketOpen', 'regularMarketPreviousClose',
    'marketCap', 'fiftyTwoWeekHigh', 'fiftyTwoWeekLow',
    'trailingPE', 'regularMarketTime', 'currency', 'quoteType',
  ].join(',');
  const data = await yfFetch(`${YF}/v7/finance/quote?symbols=${sym}&fields=${fields}`);
  return data?.quoteResponse?.result || [];
}

async function fetchNewsFor(query) {
  const url = `${YF}/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=6&quotesCount=0&lang=en-US&region=IN`;
  const data = await yfFetch(url);
  return data?.news || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// REFRESH
// ─────────────────────────────────────────────────────────────────────────────
async function refreshData() {
  if (state.loading) return;
  state.loading = true;
  setRefreshUI(true);
  showToast('Fetching latest market data…', 'info');

  try {
    // ── quotes (single batch call) ──────────────────────────────────────────
    const symbols = WATCHLIST.map(w => w.symbol);
    const results = await fetchQuotes(symbols);
    results.forEach(q => { state.quotes[q.symbol] = q; });

    // ── news (per stock, staggered to avoid rate limits) ───────────────────
    const seen    = new Set();
    const allNews = [];

    for (let i = 0; i < WATCHLIST.length; i++) {
      const w   = WATCHLIST[i];
      const key = w.symbol.replace(/\.(NS|BO)$/, '');
      try {
        const items = await fetchNewsFor(key);
        items.forEach(item => {
          if (!seen.has(item.uuid)) {
            seen.add(item.uuid);
            allNews.push({ ...item, matchedSymbol: w.symbol, matchedSector: w.sector });
          }
        });
      } catch { /* skip failed stock news silently */ }
      if (i < WATCHLIST.length - 1) await sleep(120);
    }

    state.news = allNews.sort((a, b) => b.providerPublishTime - a.providerPublishTime);
    state.lastUpdated = new Date();
    renderAll();
    showToast('Market data updated', 'success');

  } catch (err) {
    console.error('Refresh error:', err);
    showToast('Update failed — check your connection', 'error');
  } finally {
    state.loading = false;
    setRefreshUI(false);
    updateTimestamp();
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────────────────────────────────────
// FORMATTERS
// ─────────────────────────────────────────────────────────────────────────────
const INR = v => v == null ? '—' : '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PCT = v => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%';

function fmtVol(n) {
  if (!n) return '—';
  if (n >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(2) + ' L';
  return n.toLocaleString('en-IN');
}

function fmtMCap(n) {
  if (!n) return '—';
  const cr = n / 1e7;
  if (cr >= 1e5) return '₹' + (cr / 1e5).toFixed(2) + ' L Cr';
  if (cr >= 1e3) return '₹' + (cr / 1e3).toFixed(2) + 'K Cr';
  return '₹' + cr.toFixed(2) + ' Cr';
}

function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60)    return 'Just now';
  if (s < 3600)  return Math.floor(s / 60)   + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER ALL
// ─────────────────────────────────────────────────────────────────────────────
function renderAll() {
  renderSummary();
  renderTable();
  renderNews();
}

// ── Summary strip ─────────────────────────────────────────────────────────────
function renderSummary() {
  const qs = Object.values(state.quotes);
  if (!qs.length) return;
  const g   = qs.filter(q => (q.regularMarketChangePercent || 0) > 0).length;
  const l   = qs.filter(q => (q.regularMarketChangePercent || 0) < 0).length;
  const avg = qs.reduce((s, q) => s + (q.regularMarketChangePercent || 0), 0) / qs.length;

  setText('stat-tracking', WATCHLIST.length);
  setText('stat-gainers',  g);
  setText('stat-losers',   l);
  const avgEl = document.getElementById('stat-avg');
  avgEl.textContent  = PCT(avg);
  avgEl.className    = 'stat-val ' + (avg >= 0 ? 'green' : 'red');
}

// ── Stock table ───────────────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('stock-tbody');
  let stocks  = applyTableFilters();

  if (!stocks.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-cell">No stocks match the current filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = stocks.map(w => {
    const q = state.quotes[w.symbol];
    if (!q) return skeletonRow(w);

    const chg  = q.regularMarketChangePercent || 0;
    const dir  = chg >= 0 ? 'up' : 'down';
    const hi   = q.fiftyTwoWeekHigh, lo = q.fiftyTwoWeekLow, px = q.regularMarketPrice;
    const pos  = (hi && lo && hi !== lo) ? Math.round((px - lo) / (hi - lo) * 100) : null;
    const sc   = sectorColor(w.sector);
    const sym  = w.symbol.replace(/\.(NS|BO)$/, '');
    const pe   = q.trailingPE ? q.trailingPE.toFixed(1) : '—';

    return `
<tr class="stock-row" data-symbol="${w.symbol}" title="Click to filter news for ${w.name}">
  <td>
    <div class="sym-cell">
      <span class="sym-badge" style="border-color:${sc}66">${sym}</span>
      <span class="exch-pill">${w.exchange}</span>
    </div>
  </td>
  <td class="name-col">${w.name}</td>
  <td class="mono price-col">${INR(px)}</td>
  <td class="mono ${dir} chg-col">
    <span class="chg-arrow">${chg >= 0 ? '▲' : '▼'}</span>${PCT(chg)}
  </td>
  <td class="mono ${dir}">${chg >= 0 ? '+' : ''}${INR(Math.abs(q.regularMarketChange))}</td>
  <td class="mono vol-col">${fmtVol(q.regularMarketVolume)}</td>
  <td class="mono">${fmtMCap(q.marketCap)}</td>
  <td class="range-col">
    ${pos !== null ? `
    <div class="range-wrap">
      <span class="range-lo">${INR(lo)}</span>
      <div class="range-bar">
        <div class="range-fill" style="width:${pos}%"></div>
        <div class="range-dot"  style="left:${pos}%"></div>
      </div>
      <span class="range-hi">${INR(hi)}</span>
    </div>` : '<span class="muted">—</span>'}
  </td>
  <td>
    <span class="sector-tag" style="background:${sc}1a;color:${sc};border-color:${sc}44">${w.sector}</span>
  </td>
</tr>`;
  }).join('');

  // click → filter news
  tbody.querySelectorAll('.stock-row').forEach(tr => {
    tr.addEventListener('click', () => toggleNewsFilter(tr.dataset.symbol));
  });

  // restore selected row if filter is a symbol
  if (state.newsFilter.includes('.NS') || state.newsFilter.includes('.BO')) {
    const sel = tbody.querySelector(`[data-symbol="${state.newsFilter}"]`);
    if (sel) sel.classList.add('selected');
  }
}

function skeletonRow(w) {
  return `<tr class="stock-row skeleton-row">
    <td><span class="sym-badge sk">${w.symbol.replace(/\.(NS|BO)$/, '')}</span></td>
    <td>${w.name}</td>
    ${Array(7).fill('<td><span class="sk-line"></span></td>').join('')}
  </tr>`;
}

function applyTableFilters() {
  let stocks = WATCHLIST.filter(w => {
    if (state.sectorFilter !== 'all' && w.sector !== state.sectorFilter) return false;
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      return w.name.toLowerCase().includes(q) || w.symbol.toLowerCase().includes(q);
    }
    return true;
  });

  const sortFns = {
    name:          (a, b) => a.name.localeCompare(b.name) * state.sortDir,
    price:         (a, b) => cmpQuote(a, b, 'regularMarketPrice'),
    change:        (a, b) => cmpQuote(a, b, 'regularMarketChange'),
    changePercent: (a, b) => cmpQuote(a, b, 'regularMarketChangePercent'),
    volume:        (a, b) => cmpQuote(a, b, 'regularMarketVolume'),
    mcap:          (a, b) => cmpQuote(a, b, 'marketCap'),
    pe:            (a, b) => cmpQuote(a, b, 'trailingPE'),
  };

  return stocks.sort(sortFns[state.sortCol] || (() => 0));
}

function cmpQuote(a, b, field) {
  const qa = state.quotes[a.symbol]?.[field] ?? -Infinity;
  const qb = state.quotes[b.symbol]?.[field] ?? -Infinity;
  return (qa - qb) * state.sortDir;
}

// ── News inbox ────────────────────────────────────────────────────────────────
function renderNews() {
  const container = document.getElementById('news-list');
  let news        = state.news;

  if (state.newsFilter !== 'all') {
    const isSymbol = state.newsFilter.includes('.NS') || state.newsFilter.includes('.BO');
    news = news.filter(n =>
      isSymbol ? n.matchedSymbol === state.newsFilter
               : n.matchedSector === state.newsFilter
    );
  }

  document.getElementById('news-count').textContent = news.length;

  if (!news.length) {
    container.innerHTML = `
      <div class="news-empty">
        <div class="news-empty-icon">📰</div>
        <p>${state.news.length ? 'No news for this filter' : 'News loading…'}</p>
      </div>`;
    return;
  }

  container.innerHTML = news.slice(0, 40).map(item => {
    const w     = WATCHLIST.find(x => x.symbol === item.matchedSymbol) || {};
    const sym   = (item.matchedSymbol || '').replace(/\.(NS|BO)$/, '');
    const sc    = sectorColor(w.sector);
    const thumb = item.thumbnail?.resolutions?.[0]?.url;
    const ago   = timeAgo(item.providerPublishTime);

    return `
<a href="${item.link}" target="_blank" rel="noopener noreferrer" class="news-card">
  <div class="news-inner">
    ${thumb ? `<img class="news-thumb" src="${thumb}" alt="" loading="lazy" onerror="this.parentElement.classList.add('no-thumb')">` : ''}
    <div class="news-body">
      <div class="news-meta">
        <span class="news-src">${item.publisher || 'Source'}</span>
        <span class="news-dot">·</span>
        <span class="news-time">${ago}</span>
      </div>
      <p class="news-headline">${item.title}</p>
      <div class="news-tags">
        ${sym   ? `<span class="ntag" style="background:${sc}1a;color:${sc};border-color:${sc}44">${sym}</span>` : ''}
        ${w.sector ? `<span class="ntag sector-ntag">${w.sector}</span>` : ''}
      </div>
    </div>
  </div>
</a>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setRefreshUI(loading) {
  const btn  = document.getElementById('refresh-btn');
  const icon = document.getElementById('refresh-icon');
  btn.disabled = loading;
  icon.classList.toggle('spinning', loading);
}

function updateTimestamp() {
  if (!state.lastUpdated) return;
  setText('last-updated', 'Updated ' + state.lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
}

function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast ${type} visible`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('visible'), 3500);
}

function updateClock() {
  const now = new Date();
  setText('clock', now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
  updateMarketStatus(now);
}

function updateMarketStatus(now) {
  const istOff  = 5.5 * 60;
  const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const ist     = (utcMins + istOff) % (24 * 60);
  const open    = MARKET_OPEN.h  * 60 + MARKET_OPEN.m;
  const close   = MARKET_CLOSE.h * 60 + MARKET_CLOSE.m;
  // approximate weekday check in IST
  const istDay  = new Date(now.getTime() + istOff * 60000).getUTCDay();
  const isOpen  = ![0, 6].includes(istDay) && ist >= open && ist < close;

  const el = document.getElementById('market-status');
  el.textContent = isOpen ? '● Market Open' : '○ Market Closed';
  el.className   = 'market-status ' + (isOpen ? 'open' : 'closed');
}

// ─────────────────────────────────────────────────────────────────────────────
// SORT
// ─────────────────────────────────────────────────────────────────────────────
function sortBy(col) {
  state.sortDir = state.sortCol === col ? -state.sortDir : -1;
  state.sortCol = col;
  document.querySelectorAll('.sort-th').forEach(th => {
    th.classList.remove('asc', 'desc');
    if (th.dataset.col === col) th.classList.add(state.sortDir === 1 ? 'asc' : 'desc');
  });
  renderTable();
}

// ─────────────────────────────────────────────────────────────────────────────
// NEWS FILTER
// ─────────────────────────────────────────────────────────────────────────────
function toggleNewsFilter(symbol) {
  state.newsFilter = state.newsFilter === symbol ? 'all' : symbol;
  syncNewsFilterUI();
  renderNews();
  renderTable();
}

function setNewsFilter(filter, el) {
  state.newsFilter = filter;
  document.querySelectorAll('.stock-row').forEach(r => r.classList.remove('selected'));
  syncNewsFilterUI();
  document.querySelectorAll('.news-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  renderNews();
}

function syncNewsFilterUI() {
  document.querySelectorAll('.news-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.filter === state.newsFilter);
  });
  // highlight selected row
  document.querySelectorAll('.stock-row').forEach(r => {
    r.classList.toggle('selected', r.dataset.symbol === state.newsFilter);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTOR FILTER BAR
// ─────────────────────────────────────────────────────────────────────────────
function setSectorFilter(sector, btn) {
  state.sectorFilter = sector;
  document.querySelectorAll('#sector-filters .filter-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTable();
}

function buildSectorFilters() {
  const sectors   = [...new Set(WATCHLIST.map(w => w.sector))].sort();
  const container = document.getElementById('sector-filters');
  container.innerHTML =
    `<button class="filter-chip active" onclick="setSectorFilter('all',this)">All</button>` +
    sectors.map(s => {
      const c = sectorColor(s);
      return `<button class="filter-chip" style="--sc:${c}" onclick="setSectorFilter('${s}',this)">${s}</button>`;
    }).join('');
}

function buildNewsTabs() {
  const sectors   = [...new Set(WATCHLIST.map(w => w.sector))].sort();
  const container = document.getElementById('news-tabs');
  container.innerHTML =
    `<button class="news-tab active" data-filter="all" onclick="setNewsFilter('all',this)">All</button>` +
    sectors.map(s => {
      const c = sectorColor(s);
      return `<button class="news-tab" data-filter="${s}" style="--sc:${c}" onclick="setNewsFilter('${s}',this)">${s}</button>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildSectorFilters();
  buildNewsTabs();

  // Sort header clicks
  document.querySelectorAll('.sort-th').forEach(th =>
    th.addEventListener('click', () => sortBy(th.dataset.col))
  );

  // Search
  document.getElementById('search').addEventListener('input', e => {
    state.searchQuery = e.target.value.trim();
    renderTable();
  });

  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', refreshData);

  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Initial load
  refreshData();

  // Auto-refresh
  state.refreshTimer = setInterval(refreshData, REFRESH_INTERVAL_MIN * 60 * 1000);
});
