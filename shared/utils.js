// Shared utility functions

/**
 * Format timestamp to a readable, localized date string.
 * lang: 'en' (default) or 'fa' — Persian output uses Persian digits and
 * month names, but keeps the Gregorian calendar (no Jalali conversion).
 */
function formatDate(timestamp, lang) {
  lang = lang === 'fa' ? 'fa' : 'en';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const num = (v) => (lang === 'fa' ? String(v).replace(/[0-9]/g, d => FA_DIGITS[d]) : String(v));

  if (lang === 'fa') {
    if (seconds < 60) return 'همین الان';
    if (minutes < 60) return `${num(minutes)} دقیقه پیش`;
    if (hours < 24) return `${num(hours)} ساعت پیش`;
    if (days < 7) return `${num(days)} روز پیش`;
    return date.toLocaleDateString('fa-IR-u-ca-gregory', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  if (seconds < 60) {
    return 'Just now';
  } else if (minutes < 60) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (hours < 24) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (days < 7) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
}

/**
 * Truncate text to specified length
 */
function truncateText(text, maxLength = 100) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Color for the nth saved label (by position in the user's label list).
 * Colors are assigned by index — not by hashing the name — using a
 * golden-angle hue step, which guarantees every label gets a distinct hue.
 * Two different names can never collide on the same color the way a small
 * fixed hash-to-palette table could.
 */
function labelColorForIndex(index) {
  const hue = ((index * 137.508) % 360 + 360) % 360; // golden angle ≈ 137.508°
  return `hsl(${hue.toFixed(0)}, 65%, 45%)`;
}

/**
 * Extract domain from URL
 */
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

/**
 * URLs on motamem.org that should never be saved (profiles, the shop,
 * search, comment pagination, specific utility pages, etc.).
 *
 * Matching is done on the percent-encoded pathname, lowercased — Chrome
 * always returns non-ASCII path segments percent-encoded, and lowercasing
 * normalizes the hex digit case (the source page emits a mix of %D9 / %d9).
 * Accepts a URL object or a string.
 */
function isExcludedMotamemUrl(input) {
  let url;
  try {
    url = (typeof input === 'string') ? new URL(input) : input;
  } catch {
    return false;
  }
  if (!url || !url.pathname) return false;

  // /?page_id=8853 — a specific page reachable via query string.
  if (url.searchParams && url.searchParams.get('page_id') === '8853') return true;

  // Normalize: lowercase + drop trailing slash(es).
  let path = url.pathname.toLowerCase().replace(/\/+$/, '');
  if (path === '') path = '/';

  // Prefix matches: /profile/* and /sorento/*
  if (path === '/profile' || path.startsWith('/profile/')) return true;
  if (path === '/sorento' || path.startsWith('/sorento/')) return true;

  // Any post's comment pagination: /<slug>/comment-page-2/
  if (path.includes('/comment-page-')) return true;

  // Exact pages (trailing slash already stripped above).
  const EXACT = [
    '/whiteboard',
    '/search',
    '/%d9%82%d9%84%d8%a8-%d8%b3%d8%a8%d8%b2',                                                         // قلب سبز
    '/%d8%ab%d8%a8%d8%aa-%d9%86%d8%a7%d9%85-%da%a9%d8%a7%d8%b1%d8%a8%d8%b1-%d9%88%db%8c%da%98%d9%87',  // ثبت‌نام کاربر ویژه
    '/%d9%81%d8%b1%d9%88%d8%b4%da%af%d8%a7%d9%87-%d9%85%d8%aa%d9%85%d9%85'                             // فروشگاه متمم
  ];
  return EXACT.includes(path);
}

