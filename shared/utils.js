// Shared utility functions

/**
 * Format timestamp to readable date string
 */
function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) {
    return 'Just now';
  } else if (minutes < 60) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (hours < 24) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (days < 7) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString();
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

