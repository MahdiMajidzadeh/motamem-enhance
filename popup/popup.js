// Popup script

let currentTab = null;
let currentUrl = null;

// ── Theme switcher ─────────────────────────────────
// Cycles System → Light → Dark. MMTheme (shared/theme.js) persists the
// choice and applies it to <html>; the same key is read by the saved-posts
// page so both extension surfaces stay in sync.
const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_ICONS = {
  // monitor (system)
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  // sun (light)
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  // moon (dark)
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
};
const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

function updateThemeToggle(theme) {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.innerHTML = THEME_ICONS[theme] || THEME_ICONS.system;
  const label = `Theme: ${THEME_LABELS[theme] || 'System'}`;
  btn.title = `${label} — click to change`;
  btn.setAttribute('aria-label', label);
}

function setupThemeToggle() {
  const current = window.MMTheme ? window.MMTheme.get() : 'system';
  updateThemeToggle(current);

  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const cur = window.MMTheme ? window.MMTheme.get() : 'system';
    const next = THEME_ORDER[(THEME_ORDER.indexOf(cur) + 1) % THEME_ORDER.length];
    if (window.MMTheme) window.MMTheme.set(next);
    updateThemeToggle(next);
  });
}

// Initialize popup
async function init() {
  setupThemeToggle();

  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    currentTab = tabs[0];
    currentUrl = tabs[0].url;
    
    // Check if on Motammem domain
    try {
      const url = new URL(currentUrl);
      if (!url.hostname.includes('motamem.org')) {
        showStatus('Not on Motammem blog', false);
        disableActions();
      } else if (typeof isExcludedMotamemUrl === 'function' && isExcludedMotamemUrl(url)) {
        showStatus("This page can't be saved", false);
        disableActions();
      } else {
        checkCurrentPageStatus();
      }
    } catch {
      showStatus('Invalid URL', false);
      disableActions();
    }
  }
  
  // Load counts
  loadCounts();
  
  // Setup event listeners
  setupEventListeners();
}

// Check current page status
async function checkCurrentPageStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getPostStatus',
      url: currentUrl
    });
    
    if (response.success) {
      if (response.status === 'toRead') {
        showStatus('Already in To Read list', true);
      } else if (response.status === 'read') {
        showStatus('Already in Read list', true);
      } else {
        showStatus('Not saved yet', false);
      }
    }
  } catch (error) {
    console.error('Error checking status:', error);
    showStatus('Error checking status', false);
  }
}

// Show status message
function showStatus(message, isSaved) {
  const statusEl = document.getElementById('current-page-status');
  const statusText = statusEl.querySelector('.status-text');
  statusText.textContent = message;
  statusText.className = isSaved ? 'status-text saved' : 'status-text';
}

// Disable action buttons
function disableActions() {
  document.getElementById('add-to-read').disabled = true;
  document.getElementById('add-to-read-list').disabled = true;
}

// Load counts
async function loadCounts() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getCounts' });
    if (response.success) {
      document.getElementById('toread-count').textContent = response.counts.toRead;
      document.getElementById('read-count').textContent = response.counts.read;
    }
  } catch (error) {
    console.error('Error loading counts:', error);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Add to To Read
  document.getElementById('add-to-read').addEventListener('click', async () => {
    await addToList('toRead');
  });
  
  // Add to Read
  document.getElementById('add-to-read-list').addEventListener('click', async () => {
    await addToList('read');
  });
  
  // View saved posts
  document.getElementById('view-saved').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/saved-posts.html') });
    window.close();
  });
  
  // Export
  document.getElementById('export-btn').addEventListener('click', handleExport);
  
  // Import
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  
  document.getElementById('import-file').addEventListener('change', handleImport);
}

// Add to list
async function addToList(listType) {
  if (!currentUrl) return;
  
  try {
    const title = currentTab?.title || currentUrl;
    const action = listType === 'toRead' ? 'addToRead' : 'addToReadList';
    
    const response = await chrome.runtime.sendMessage({
      action,
      url: currentUrl,
      title
    });
    
    if (response.success) {
      showNotification(`Added to ${listType === 'toRead' ? 'To Read' : 'Read'} list`, 'success');
      checkCurrentPageStatus();
      loadCounts();
    } else {
      showNotification(response.error || 'Failed to add post', 'error');
    }
  } catch (error) {
    showNotification('Error: ' + error.message, 'error');
  }
}

// Handle export
async function handleExport() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'exportData' });
    if (response.success) {
      const blob = new Blob([response.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `motammem-saved-posts-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showNotification('Export successful', 'success');
    } else {
      showNotification('Export failed', 'error');
    }
  } catch (error) {
    showNotification('Error: ' + error.message, 'error');
  }
}

// Handle import
async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const response = await chrome.runtime.sendMessage({
      action: 'importData',
      data: text
    });
    
    if (response.success) {
      showNotification(
        `Imported ${response.result.imported} posts, skipped ${response.result.skipped} duplicates`,
        'success'
      );
      loadCounts();
      // Reset file input
      event.target.value = '';
    } else {
      showNotification(response.error || 'Import failed', 'error');
    }
  } catch (error) {
    showNotification('Error: ' + error.message, 'error');
  }
}

// Show notification
function showNotification(message, type = 'success') {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = `notification ${type} show`;
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// Initialize on load
init();

