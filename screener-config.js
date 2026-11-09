// ═══════════════════════════════════════════════════════════════════
//  WATCHLIST CONFIG  —  Edit this file to add / remove stocks
//
//  symbol  : Yahoo Finance symbol  (NSE → append .NS, BSE → append .BO)
//  name    : Display name
//  sector  : Sector label (used for colour coding & news filtering)
//  exchange: 'NSE' or 'BSE'
// ═══════════════════════════════════════════════════════════════════
const WATCHLIST = [
  { symbol: 'RELIANCE.NS',   name: 'Reliance Industries',       sector: 'Energy',   exchange: 'NSE' },
  { symbol: 'TCS.NS',        name: 'Tata Consultancy Services', sector: 'IT',       exchange: 'NSE' },
  { symbol: 'HDFCBANK.NS',   name: 'HDFC Bank',                 sector: 'Banking',  exchange: 'NSE' },
  { symbol: 'INFY.NS',       name: 'Infosys',                   sector: 'IT',       exchange: 'NSE' },
  { symbol: 'ICICIBANK.NS',  name: 'ICICI Bank',                sector: 'Banking',  exchange: 'NSE' },
  { symbol: 'WIPRO.NS',      name: 'Wipro',                     sector: 'IT',       exchange: 'NSE' },
  { symbol: 'ITC.NS',        name: 'ITC',                       sector: 'FMCG',     exchange: 'NSE' },
  { symbol: 'SBIN.NS',       name: 'State Bank of India',       sector: 'Banking',  exchange: 'NSE' },
  { symbol: 'BAJFINANCE.NS', name: 'Bajaj Finance',             sector: 'NBFC',     exchange: 'NSE' },
  { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever',        sector: 'FMCG',     exchange: 'NSE' },
  { symbol: 'SUNPHARMA.NS',  name: 'Sun Pharmaceutical',        sector: 'Pharma',   exchange: 'NSE' },
  { symbol: 'MARUTI.NS',     name: 'Maruti Suzuki',             sector: 'Auto',     exchange: 'NSE' },
];

// Auto-refresh interval (minutes)
const REFRESH_INTERVAL_MIN = 5;

// NSE market hours (IST)
const MARKET_OPEN  = { h: 9,  m: 15 };
const MARKET_CLOSE = { h: 15, m: 30 };
