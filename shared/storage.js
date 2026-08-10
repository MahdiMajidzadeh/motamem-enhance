// Storage utility functions for managing saved posts

const STORAGE_KEYS = {
  TO_READ: 'toRead',
  READ: 'read',
  LABELS: 'labels'
};

/** Max labels allowed on a single post, and max length of a label name. */
const MAX_LABELS_PER_POST = 8;
const MAX_LABEL_LENGTH = 24;

/** Max length of a personal note attached to a post. */
const MAX_NOTE_LENGTH = 2000;

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
 * Get all posts from a list with pagination. Optionally restrict to posts
 * carrying a given label (case-insensitive match) and/or matching a search
 * query against the post's title or note (case-insensitive substring).
 */
async function getAllPosts(listType, page = 1, pageSize = 20, labelFilter = null, searchQuery = null) {
  const key = listType === 'toRead' ? STORAGE_KEYS.TO_READ : STORAGE_KEYS.READ;
  const data = await chrome.storage.local.get([key]);
  let list = data[key] || [];

  if (labelFilter) {
    const wanted = labelFilter.toLowerCase();
    list = list.filter(item => Array.isArray(item.labels) && item.labels.some(l => l.toLowerCase() === wanted));
  }

  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter(item => {
      if (item.title && item.title.toLowerCase().includes(q)) return true;
      if (item.note && item.note.toLowerCase().includes(q)) return true;
      if (Array.isArray(item.labels) && item.labels.some(l => l.toLowerCase().includes(q))) return true;
      return false;
    });
  }

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
  const labels = await _getLabelDefs();
  return JSON.stringify({
    toRead,
    read,
    labels,
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

    // Merge label definitions too (preserves creation order for existing
    // labels; new ones from the import are appended), so per-label colors
    // stay stable across an export/import round-trip.
    const existingLabelDefs = await _getLabelDefs();
    const existingLabelsLower = new Set(existingLabelDefs.map(l => l.toLowerCase()));
    const importedLabelDefs = Array.isArray(imported.labels) ? imported.labels : [];
    const mergedLabelDefs = [...existingLabelDefs];
    for (const raw of importedLabelDefs) {
      const trimmed = String(raw || '').trim().slice(0, MAX_LABEL_LENGTH);
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (existingLabelsLower.has(lower)) continue;
      existingLabelsLower.add(lower);
      mergedLabelDefs.push(trimmed);
    }

    await chrome.storage.local.set({
      [STORAGE_KEYS.TO_READ]: [...newToRead, ...existingToRead],
      [STORAGE_KEYS.READ]: [...newRead, ...existingRead],
      [STORAGE_KEYS.LABELS]: mergedLabelDefs
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

/**
 * Read the global list of label names the user has created so far (across
 * both lists). Stored separately from the posts so a label can exist (and
 * show up as a suggestion) even between uses.
 */
async function _getLabelDefs() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.LABELS]);
  return Array.isArray(data[STORAGE_KEYS.LABELS]) ? data[STORAGE_KEYS.LABELS] : [];
}

/**
 * Get all known label names, sorted for display.
 */
async function getLabels() {
  const labels = await _getLabelDefs();
  return [...labels].sort((a, b) => a.localeCompare(b));
}

/**
 * Remove a label entirely: drops it from the global list and strips it from
 * every post in both lists that carries it.
 */
async function deleteLabel(name) {
  const wanted = (name || '').trim().toLowerCase();
  if (!wanted) throw new Error('Label name is required');

  return withLock(async () => {
    const [labels, { toRead, read }] = await Promise.all([_getLabelDefs(), _getLists()]);

    const strip = (list) => list.map(post => {
      if (!Array.isArray(post.labels) || !post.labels.some(l => l.toLowerCase() === wanted)) return post;
      return { ...post, labels: post.labels.filter(l => l.toLowerCase() !== wanted) };
    });

    await chrome.storage.local.set({
      [STORAGE_KEYS.LABELS]: labels.filter(l => l.toLowerCase() !== wanted),
      [STORAGE_KEYS.TO_READ]: strip(toRead),
      [STORAGE_KEYS.READ]: strip(read)
    });
    return true;
  });
}

/**
 * Set the full label list for a single post (replaces, doesn't merge).
 * Any brand-new label names are also registered in the global label list so
 * they show up as suggestions for other posts. Names are trimmed, deduped
 * case-insensitively, length-capped, and limited to MAX_LABELS_PER_POST.
 */
async function setPostLabels(url, listType, labels) {
  if (!Array.isArray(labels)) throw new Error('labels must be an array');

  const cleanLabels = [];
  const seenLower = new Set();
  for (const raw of labels) {
    const trimmed = String(raw || '').trim().slice(0, MAX_LABEL_LENGTH);
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seenLower.has(lower)) continue;
    seenLower.add(lower);
    cleanLabels.push(trimmed);
    if (cleanLabels.length >= MAX_LABELS_PER_POST) break;
  }

  return withLock(async () => {
    const storageKey = listType === 'toRead' ? STORAGE_KEYS.TO_READ : STORAGE_KEYS.READ;
    const data = await chrome.storage.local.get([storageKey]);
    const list = data[storageKey] || [];
    const key = urlKey(url);
    const idx = list.findIndex(item => urlKey(item.url) === key);
    if (idx === -1) throw new Error('Post not found');

    const updatedPost = { ...list[idx], labels: cleanLabels };
    const updatedList = [...list];
    updatedList[idx] = updatedPost;

    // Register any new label names in the global list.
    const existingDefs = await _getLabelDefs();
    const existingLower = new Set(existingDefs.map(l => l.toLowerCase()));
    const newDefs = [...existingDefs];
    for (const l of cleanLabels) {
      if (!existingLower.has(l.toLowerCase())) {
        existingLower.add(l.toLowerCase());
        newDefs.push(l);
      }
    }

    const toSet = { [storageKey]: updatedList };
    if (newDefs.length !== existingDefs.length) {
      toSet[STORAGE_KEYS.LABELS] = newDefs;
    }
    await chrome.storage.local.set(toSet);

    return updatedPost;
  });
}

/**
 * Set (or clear) the free-text note attached to a single post. Pass an empty
 * string to remove an existing note.
 */
async function setPostNote(url, listType, note) {
  const cleanNote = String(note || '').trim().slice(0, MAX_NOTE_LENGTH);

  return withLock(async () => {
    const storageKey = listType === 'toRead' ? STORAGE_KEYS.TO_READ : STORAGE_KEYS.READ;
    const data = await chrome.storage.local.get([storageKey]);
    const list = data[storageKey] || [];
    const key = urlKey(url);
    const idx = list.findIndex(item => urlKey(item.url) === key);
    if (idx === -1) throw new Error('Post not found');

    const updatedPost = { ...list[idx], note: cleanNote };
    const updatedList = [...list];
    updatedList[idx] = updatedPost;

    await chrome.storage.local.set({ [storageKey]: updatedList });
    return updatedPost;
  });
}

/**
 * 'YYYY-MM' key for the month a timestamp falls in (local time).
 */
function monthKeyOf(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Sentinel label name for posts without any label. Storage stays
 * language-neutral; the UI translates this key to the display string for
 * whichever language is active (English "Uncategorized" / Persian
 * "دسته‌بندی نشده"). */
const UNCATEGORIZED_KEY = '__uncategorized__';

function shiftMonthKeyBy(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Monthly reading stats for a given 'YYYY-MM' month, grouped by label.
 *
 * A post counts as "read" for the month it was added to the Read list, and
 * "unread" for the month it was added to the To Read list — both driven by
 * the post's own addedAt, which is refreshed whenever a post is (re)added or
 * moved between lists. Posts with no labels are grouped under the
 * UNCATEGORIZED_KEY sentinel. A post with multiple labels is counted once
 * under each of its labels.
 */
async function getMonthlyStats(monthKey) {
  const { toRead, read } = await _getLists();
  const inMonth = (item) => monthKeyOf(item.addedAt) === monthKey;

  const readInMonth = read.filter(inMonth);
  const unreadInMonth = toRead.filter(inMonth);

  const counts = new Map(); // label name -> { read, unread }
  const bump = (label, key) => {
    const entry = counts.get(label) || { read: 0, unread: 0 };
    entry[key]++;
    counts.set(label, entry);
  };

  const labelsOf = (post) => (Array.isArray(post.labels) && post.labels.length ? post.labels : [UNCATEGORIZED_KEY]);

  readInMonth.forEach(post => labelsOf(post).forEach(l => bump(l, 'read')));
  unreadInMonth.forEach(post => labelsOf(post).forEach(l => bump(l, 'unread')));

  const labels = [...counts.entries()]
    .map(([name, c]) => ({ name, read: c.read, unread: c.unread }))
    .sort((a, b) => (b.read + b.unread) - (a.read + a.unread) || a.name.localeCompare(b.name));

  return {
    month: monthKey,
    totalRead: readInMonth.length,
    totalUnread: unreadInMonth.length,
    labels
  };
}

/**
 * A trailing series of monthly stats (oldest → newest), ending at endMonthKey,
 * for the "last N months" line chart. Reuses getMonthlyStats per month, then
 * reshapes into per-label time series so the front end can draw one line per
 * label plus one aggregate "unread" line.
 */
async function getMonthlyStatsSeries(endMonthKey, monthsCount = 6) {
  const monthKeys = [];
  for (let i = monthsCount - 1; i >= 0; i--) {
    monthKeys.push(shiftMonthKeyBy(endMonthKey, -i));
  }

  const monthly = await Promise.all(monthKeys.map(mk => getMonthlyStats(mk)));

  const labelSet = new Set();
  monthly.forEach(m => m.labels.forEach(l => labelSet.add(l.name)));

  const labels = [...labelSet].sort().map(name => ({
    name,
    read: monthly.map(m => (m.labels.find(l => l.name === name) || { read: 0 }).read),
    unread: monthly.map(m => (m.labels.find(l => l.name === name) || { unread: 0 }).unread)
  }));

  return {
    months: monthKeys,
    totalsRead: monthly.map(m => m.totalRead),
    totalsUnread: monthly.map(m => m.totalUnread),
    labels
  };
}
