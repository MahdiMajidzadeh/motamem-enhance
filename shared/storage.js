// Storage utility functions for managing saved posts

const STORAGE_KEYS = {
  TO_READ: 'toRead',
  READ: 'read'
};

// Query params that identify a campaign/click rather than the content itself.
// Two URLs that differ only by these point at the same post.
const TRACKING_PARAMS = [
  'fbclid', 'gclid', 'gbraid', 'wbraid', 'msclkid', 'yclid',
  'mc_cid', 'mc_eid', 'igshid', 'ref', 'ref_src', 'source', 'spm'
];

/**
 * Clean a URL into the canonical form we store and display: drop the fragment
 * and tracking params, and remove a trailing slash. The protocol, host casing,
 * and meaningful query params are preserved so the link still resolves.
 */
function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.includes(key.toLowerCase())) {
        u.searchParams.delete(key);
      }
    }
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  } catch {
    return rawUrl; // not a parseable URL — leave it untouched
  }
}

/**
 * Derive a comparison key for duplicate detection. Stricter than normalizeUrl:
 * also protocol-agnostic (http == https), strips a leading "www.", and sorts
 * the remaining query params so order doesn't matter. Used only for matching,
 * never stored — so it also matches posts saved before normalization existed.
 */
function urlKey(rawUrl) {
  try {
    const u = new URL(normalizeUrl(rawUrl));
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const params = [...u.searchParams.entries()].sort();
    const search = params.length ? '?' + params.map(([k, v]) => `${k}=${v}`).join('&') : '';
    return host + path + search;
  } catch {
    return rawUrl;
  }
}

/**
 * Serialize mutating operations so concurrent requests can't interleave their
 * read-modify-write sequences and clobber each other's writes.
 *
 * chrome.storage.local has no atomic update primitive: every mutation is
 * `get` -> mutate in JS -> `set`. The service worker handles each incoming
 * message as a separate async task, so two near-simultaneous writes (e.g. a
 * hover tooltip and the floating button) would both read the old array and the
 * second `set` would overwrite the first. Chaining every mutation on a single
 * promise guarantees each one completes before the next begins.
 */
let _writeLock = Promise.resolve();
function withLock(fn) {
  const result = _writeLock.then(() => fn());
  // Keep the chain alive even if this operation rejects; swallow only on the
  // internal chain, the real result/rejection is still returned to the caller.
  _writeLock = result.then(() => {}, () => {});
  return result;
}

/**
 * Read both lists in a single round-trip, defaulting missing keys to [].
 */
async function _getLists() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.TO_READ, STORAGE_KEYS.READ]);
  return {
    toRead: data[STORAGE_KEYS.TO_READ] || [],
    read: data[STORAGE_KEYS.READ] || []
  };
}

/**
 * Initialize storage if it doesn't exist
 */
async function initStorage() {
  return withLock(async () => {
    const { toRead, read } = await _getLists();
    await chrome.storage.local.set({
      [STORAGE_KEYS.TO_READ]: toRead,
      [STORAGE_KEYS.READ]: read
    });
  });
}

/**
 * Add post to "to read" list
 */
async function addToRead(url, title) {
  return withLock(async () => {
    const { toRead, read } = await _getLists();
    const key = urlKey(url);

    if (toRead.some(item => urlKey(item.url) === key)) {
      throw new Error('Post already in "to read" list');
    }

    // Remove from "read" list if it exists there, then prepend to "to read".
    const newRead = read.filter(item => urlKey(item.url) !== key);
    const newToRead = [{ url: normalizeUrl(url), title: title || url, addedAt: Date.now() }, ...toRead];

    await chrome.storage.local.set({
      [STORAGE_KEYS.TO_READ]: newToRead,
      [STORAGE_KEYS.READ]: newRead
    });
    return true;
  });
}

/**
 * Add post to "read" list
 */
async function addToReadList(url, title) {
  return withLock(async () => {
    const { toRead, read } = await _getLists();
    const key = urlKey(url);

    if (read.some(item => urlKey(item.url) === key)) {
      throw new Error('Post already in "read" list');
    }

    // Remove from "to read" list if it exists there, then prepend to "read".
    const newToRead = toRead.filter(item => urlKey(item.url) !== key);
    const newRead = [{ url: normalizeUrl(url), title: title || url, addedAt: Date.now() }, ...read];

    await chrome.storage.local.set({
      [STORAGE_KEYS.TO_READ]: newToRead,
      [STORAGE_KEYS.READ]: newRead
    });
    return true;
  });
}

/**
 * Remove post from a list
 */
async function removeFromList(url, listType) {
  return withLock(async () => {
    const storageKey = listType === 'toRead' ? STORAGE_KEYS.TO_READ : STORAGE_KEYS.READ;
    const data = await chrome.storage.local.get([storageKey]);
    const list = data[storageKey] || [];
    const key = urlKey(url);

    await chrome.storage.local.set({ [storageKey]: list.filter(item => urlKey(item.url) !== key) });
    return true;
  });
}

/**
 * Move post from one list to another
 */
async function movePost(url, fromList, toList) {
  return withLock(async () => {
    const fromKey = fromList === 'toRead' ? STORAGE_KEYS.TO_READ : STORAGE_KEYS.READ;
    const toKey = toList === 'toRead' ? STORAGE_KEYS.TO_READ : STORAGE_KEYS.READ;

    const data = await chrome.storage.local.get([fromKey, toKey]);
    const fromListData = data[fromKey] || [];
    const toListData = data[toKey] || [];
    const key = urlKey(url);

    const post = fromListData.find(item => urlKey(item.url) === key);
    if (!post) {
      throw new Error('Post not found in source list');
    }

    const filteredFrom = fromListData.filter(item => urlKey(item.url) !== key);
    const updatedPost = { ...post, addedAt: Date.now() };

    await chrome.storage.local.set({
      [fromKey]: filteredFrom,
      [toKey]: [updatedPost, ...toListData]
    });
    return true;
  });
}

/**
 * Get all posts from a list with pagination
 */
async function getAllPosts(listType, page = 1, pageSize = 20) {
  const key = listType === 'toRead' ? STORAGE_KEYS.TO_READ : STORAGE_KEYS.READ;
  const data = await chrome.storage.local.get([key]);
  const list = data[key] || [];

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const paginated = list.slice(start, end);

  return {
    posts: paginated,
    total: list.length,
    page,
    pageSize,
    totalPages: Math.ceil(list.length / pageSize)
  };
}

/**
 * Get post status (which list it's in, if any)
 */
async function getPostStatus(url) {
  const { toRead, read } = await _getLists();
  const key = urlKey(url);
  if (toRead.some(item => urlKey(item.url) === key)) return 'toRead';
  if (read.some(item => urlKey(item.url) === key)) return 'read';
  return null;
}

/**
 * Export all data to JSON
 */
async function exportData() {
  const { toRead, read } = await _getLists();
  return JSON.stringify({
    toRead,
    read,
    exportedAt: Date.now()
  }, null, 2);
}

/**
 * Import data from JSON
 */
async function importData(jsonData) {
  let imported;
  try {
    imported = JSON.parse(jsonData);
  } catch (error) {
    throw new Error('Failed to import data: ' + error.message);
  }

  if (!imported || !Array.isArray(imported.toRead) || !Array.isArray(imported.read)) {
    throw new Error('Invalid data format');
  }

  return withLock(async () => {
    // Merge with existing data, avoiding duplicates by normalized key. The
    // `seen` set grows as we go so duplicates within the imported file (and
    // across its two lists) are skipped too, not just collisions with existing
    // posts.
    const { toRead: existingToRead, read: existingRead } = await _getLists();

    const seen = new Set([
      ...existingToRead.map(p => urlKey(p.url)),
      ...existingRead.map(p => urlKey(p.url))
    ]);

    const dedupe = (list) => {
      const out = [];
      for (const p of list) {
        if (!p || !p.url) continue;
        const key = urlKey(p.url);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...p, url: normalizeUrl(p.url) });
      }
      return out;
    };

    const newToRead = dedupe(imported.toRead);
    const newRead = dedupe(imported.read);

    await chrome.storage.local.set({
      [STORAGE_KEYS.TO_READ]: [...newToRead, ...existingToRead],
      [STORAGE_KEYS.READ]: [...newRead, ...existingRead]
    });

    return {
      imported: newToRead.length + newRead.length,
      skipped: imported.toRead.length + imported.read.length - newToRead.length - newRead.length
    };
  });
}

/**
 * Get counts for both lists
 */
async function getCounts() {
  const { toRead, read } = await _getLists();
  return {
    toRead: toRead.length,
    read: read.length
  };
}
