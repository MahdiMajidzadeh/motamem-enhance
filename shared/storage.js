// Storage utility functions for managing saved posts

const STORAGE_KEYS = {
  TO_READ: 'toRead',
  READ: 'read'
};

/**
 * Initialize storage if it doesn't exist
 */
async function initStorage() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.TO_READ, STORAGE_KEYS.READ]);
  if (!data[STORAGE_KEYS.TO_READ]) {
    await chrome.storage.local.set({ [STORAGE_KEYS.TO_READ]: [] });
  }
  if (!data[STORAGE_KEYS.READ]) {
    await chrome.storage.local.set({ [STORAGE_KEYS.READ]: [] });
  }
}

/**
 * Check if a URL already exists in a list
 */
async function urlExists(url, listType) {
  const key = listType === 'toRead' ? STORAGE_KEYS.TO_READ : STORAGE_KEYS.READ;
  const data = await chrome.storage.local.get([key]);
  const list = data[key] || [];
  return list.some(item => item.url === url);
}

/**
 * Add post to "to read" list
 */
async function addToRead(url, title) {
  await initStorage();
  
  // Check if already exists
  if (await urlExists(url, 'toRead')) {
    throw new Error('Post already in "to read" list');
  }
  
  // Remove from "read" list if it exists there
  await removeFromList(url, 'read');
  
  const data = await chrome.storage.local.get([STORAGE_KEYS.TO_READ]);
  const toRead = data[STORAGE_KEYS.TO_READ] || [];
  
  toRead.unshift({
    url,
    title: title || url,
    addedAt: Date.now()
  });
  
  await chrome.storage.local.set({ [STORAGE_KEYS.TO_READ]: toRead });
  return true;
}

/**
 * Add post to "read" list
 */
async function addToReadList(url, title) {
  await initStorage();
  
  // Check if already exists
  if (await urlExists(url, 'read')) {
    throw new Error('Post already in "read" list');
  }
  
  // Remove from "to read" list if it exists there
  await removeFromList(url, 'toRead');
  
  const data = await chrome.storage.local.get([STORAGE_KEYS.READ]);
  const read = data[STORAGE_KEYS.READ] || [];
  
  read.unshift({
    url,
    title: title || url,
    addedAt: Date.now()
  });
  
  await chrome.storage.local.set({ [STORAGE_KEYS.READ]: read });
  return true;
}

/**
 * Remove post from a list
 */
async function removeFromList(url, listType) {
  await initStorage();
  const key = listType === 'toRead' ? STORAGE_KEYS.TO_READ : STORAGE_KEYS.READ;
  const data = await chrome.storage.local.get([key]);
  const list = data[key] || [];
  
  const filtered = list.filter(item => item.url !== url);
  await chrome.storage.local.set({ [key]: filtered });
  return true;
}

/**
 * Move post from one list to another
 */
async function movePost(url, fromList, toList) {
  await initStorage();
  
  const fromKey = fromList === 'toRead' ? STORAGE_KEYS.TO_READ : STORAGE_KEYS.READ;
  const toKey = toList === 'toRead' ? STORAGE_KEYS.TO_READ : STORAGE_KEYS.READ;
  
  const data = await chrome.storage.local.get([fromKey, toKey]);
  const fromListData = data[fromKey] || [];
  const toListData = data[toKey] || [];
  
  const post = fromListData.find(item => item.url === url);
  if (!post) {
    throw new Error('Post not found in source list');
  }
  
  // Remove from source list
  const filteredFrom = fromListData.filter(item => item.url !== url);
  
  // Add to target list (update timestamp)
  const updatedPost = { ...post, addedAt: Date.now() };
  toListData.unshift(updatedPost);
  
  await chrome.storage.local.set({
    [fromKey]: filteredFrom,
    [toKey]: toListData
  });
  
  return true;
}

/**
 * Get all posts from a list with pagination
 */
async function getAllPosts(listType, page = 1, pageSize = 20) {
  await initStorage();
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
  await initStorage();
  const toReadExists = await urlExists(url, 'toRead');
  const readExists = await urlExists(url, 'read');
  
  if (toReadExists) return 'toRead';
  if (readExists) return 'read';
  return null;
}

/**
 * Export all data to JSON
 */
async function exportData() {
  await initStorage();
  const data = await chrome.storage.local.get([STORAGE_KEYS.TO_READ, STORAGE_KEYS.READ]);
  
  return JSON.stringify({
    toRead: data[STORAGE_KEYS.TO_READ] || [],
    read: data[STORAGE_KEYS.READ] || [],
    exportedAt: Date.now()
  }, null, 2);
}

/**
 * Import data from JSON
 */
async function importData(jsonData) {
  try {
    const imported = JSON.parse(jsonData);
    
    if (!imported.toRead || !imported.read) {
      throw new Error('Invalid data format');
    }
    
    // Merge with existing data, avoiding duplicates
    const existing = await chrome.storage.local.get([STORAGE_KEYS.TO_READ, STORAGE_KEYS.READ]);
    const existingToRead = existing[STORAGE_KEYS.TO_READ] || [];
    const existingRead = existing[STORAGE_KEYS.READ] || [];
    
    const existingUrls = new Set([
      ...existingToRead.map(p => p.url),
      ...existingRead.map(p => p.url)
    ]);
    
    const newToRead = imported.toRead.filter(p => !existingUrls.has(p.url));
    const newRead = imported.read.filter(p => !existingUrls.has(p.url));
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.TO_READ]: [...newToRead, ...existingToRead],
      [STORAGE_KEYS.READ]: [...newRead, ...existingRead]
    });
    
    return {
      imported: newToRead.length + newRead.length,
      skipped: imported.toRead.length + imported.read.length - newToRead.length - newRead.length
    };
  } catch (error) {
    throw new Error('Failed to import data: ' + error.message);
  }
}

/**
 * Get counts for both lists
 */
async function getCounts() {
  await initStorage();
  const data = await chrome.storage.local.get([STORAGE_KEYS.TO_READ, STORAGE_KEYS.READ]);
  
  return {
    toRead: (data[STORAGE_KEYS.TO_READ] || []).length,
    read: (data[STORAGE_KEYS.READ] || []).length
  };
}

