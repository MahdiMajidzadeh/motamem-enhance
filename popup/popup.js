// Popup script

let currentTab = null;
let currentUrl = null;

const t = (key, vars) => (window.MMI18n ? window.MMI18n.t(key, vars) : key);

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

function updateThemeToggle(theme) {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.innerHTML = THEME_ICONS[theme] || THEME_ICONS.system;
  const themeLabelKey = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' }[theme] || 'themeSystem';
  const label = t(themeLabelKey);
  btn.title = t('themeTitle', { label });
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

// ── Language switcher ──────────────────────────────
// Toggles fa ↔ en. MMI18n (shared/i18n.js) persists the choice and sets
// <html lang/dir>; the same preference is read by the saved-posts page and
// (best-effort) the content script so all surfaces stay in sync.
function updateLangToggle(lang) {
  const btn = document.getElementById('lang-toggle');
  if (!btn) return;
  // Label the language the button switches *to*, not the active one.
  btn.textContent = lang === 'fa' ? 'EN' : 'FA';
  const label = t('langAria');
  btn.title = t('langTitle', { label });
  btn.setAttribute('aria-label', label);
}

function setupLangToggle() {
  const current = window.MMI18n ? window.MMI18n.get() : 'fa';
  updateLangToggle(current);

  const btn = document.getElementById('lang-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const cur = window.MMI18n ? window.MMI18n.get() : 'fa';
    const next = cur === 'fa' ? 'en' : 'fa';
    if (window.MMI18n) window.MMI18n.set(next);
    updateLangToggle(next);
    updateThemeToggle(window.MMTheme ? window.MMTheme.get() : 'system');
    // Re-run anything that shows dynamic (non data-i18n) text.
    refreshDynamicText();
    loadCounts();
  });
}

// Re-render bits of UI that showStatus()/notifications etc. already wrote in
// the previous language, so a language switch doesn't leave stale text.
function refreshDynamicText() {
  // The action buttons' labels are rendered, not data-i18n, so translatePage()
  // can't reach them once renderSlot() has replaced their markup.
  renderActionButtons();
  if (currentUrl) {
    checkCurrentPageStatus();
  }
}

// Initialize popup
async function init() {
  if (window.MMI18n) window.MMI18n.translatePage();
  setupThemeToggle();
  setupLangToggle();

  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    currentTab = tabs[0];
    currentUrl = tabs[0].url;
    
    // Check if on Motamem domain
    try {
      const url = new URL(currentUrl);
      if (!url.hostname.includes('motamem.org')) {
        showStatus(t('notOnBlog'), false);
        disableActions();
      } else if (typeof isExcludedMotamemUrl === 'function' && isExcludedMotamemUrl(url)) {
        showStatus(t('pageCannotBeSaved'), false);
        disableActions();
      } else {
        checkCurrentPageStatus();
      }
    } catch {
      showStatus(t('invalidUrl'), false);
      disableActions();
    }
  }
  
  // Load counts
  loadCounts();
  
  // Setup event listeners
  setupEventListeners();
}

// ── Action buttons ─────────────────────────────────
// Mirrors the in-page card (content/content-script.js): each button owns a
// fixed slot, and its role depends on where the page is currently saved:
//   saved in this slot  -> 'remove' (take it out of that list)
//   saved in the other  -> 'move'   (move it over, keeping labels/notes)
//   not saved at all    -> 'add'
const SLOT_BUTTON_IDS = { toRead: 'add-to-read', read: 'add-to-read-list' };

// Icons match the markup in popup.html so a re-render is visually identical.
const ACTION_ICONS = {
  toRead: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H11v16H4.5A2.5 2.5 0 0 0 2 21.5z"/><path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H13v16h6.5a2.5 2.5 0 0 1 2.5 2.5z"/></svg>',
  read: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.2 7 10 18.2 4.8 13"/></svg>',
  remove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
};

// Which list the current page is saved in: null | 'toRead' | 'read'.
let savedStatus = null;

function roleFor(slot) {
  if (savedStatus === slot) return 'remove';
  return savedStatus ? 'move' : 'add';
}

function renderActionButtons() {
  renderSlot('toRead');
  renderSlot('read');
}

function renderSlot(slot) {
  const btn = document.getElementById(SLOT_BUTTON_IDS[slot]);
  if (!btn) return;

  const isRemove = roleFor(slot) === 'remove';
  const isToRead = slot === 'toRead';

  const icon = isRemove ? ACTION_ICONS.remove : ACTION_ICONS[slot];
  const label = isRemove ? t('remove') : (isToRead ? t('toRead') : t('read'));
  // Replaces the data-i18n span from popup.html, so these labels are refreshed
  // by renderActionButtons() on a language switch rather than translatePage().
  btn.innerHTML = icon + '<span>' + label + '</span>';

  btn.classList.toggle('is-remove', isRemove);
  btn.title = titleFor(slot, isRemove);
}

function titleFor(slot, isRemove) {
  const isToRead = slot === 'toRead';
  if (isRemove) return isToRead ? t('removeFromToReadTitle') : t('removeFromReadTitle');
  // Saved in the other list, so this button moves it rather than adding.
  if (savedStatus) return isToRead ? t('moveToToRead') : t('markAsRead');
  return isToRead ? t('addToToReadTitle') : t('addToReadTitle');
}

// Check current page status
async function checkCurrentPageStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getPostStatus',
      url: currentUrl
    });

    if (response.success) {
      savedStatus = (response.status === 'toRead' || response.status === 'read') ? response.status : null;
      renderActionButtons();

      if (response.status === 'toRead') {
        showStatus(t('alreadyInToRead'), true);
      } else if (response.status === 'read') {
        showStatus(t('alreadyInRead'), true);
      } else {
        showStatus(t('notSavedYet'), false);
      }
    }
  } catch (error) {
    console.error('Error checking status:', error);
    showStatus(t('errorCheckingStatus'), false);
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
      const n = window.MMI18n ? window.MMI18n.n : String;
      document.getElementById('toread-count').textContent = n(response.counts.toRead);
      document.getElementById('read-count').textContent = n(response.counts.read);
    }
  } catch (error) {
    console.error('Error loading counts:', error);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Each button owns a fixed slot; what it does depends on where the page is
  // currently saved (see roleFor).
  document.getElementById('add-to-read').addEventListener('click', () => handleSlotClick('toRead'));
  document.getElementById('add-to-read-list').addEventListener('click', () => handleSlotClick('read'));
  
  // View saved posts
  document.getElementById('view-saved').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/saved-posts.html') });
    window.close();
  });
}

// Add / move / remove, depending on what the clicked slot currently means.
// Mirrors handleSlotClick() in content/content-script.js — same roles, same
// requests — so the popup and the in-page card behave identically.
// Deliberately silent on success: the button flipping to or from Remove, plus
// the status line and counts updating, is the feedback. Only failures notify.
async function handleSlotClick(slot) {
  if (!currentUrl) return;

  const role = roleFor(slot);
  try {
    let request;
    if (role === 'remove') {
      request = { action: 'removeFromList', url: currentUrl, listType: slot };
    } else if (role === 'move') {
      // movePost, not addToRead/addToReadList: those build a fresh post object
      // and would silently drop the post's labels and note.
      request = { action: 'movePost', url: currentUrl, fromList: savedStatus, toList: slot };
    } else {
      request = {
        action: slot === 'toRead' ? 'addToRead' : 'addToReadList',
        url: currentUrl,
        title: currentTab?.title || currentUrl
      };
    }

    const response = await chrome.runtime.sendMessage(request);

    if (response && response.success) {
      // Re-read rather than assuming: this also refreshes the status line.
      await checkCurrentPageStatus();
      loadCounts();
    } else {
      showNotification((response && response.error) || failureMessage(role), 'error');
    }
  } catch (error) {
    showNotification(t('errorPrefix') + error.message, 'error');
  }
}

function failureMessage(role) {
  if (role === 'remove') return t('failedToRemovePost');
  if (role === 'move') return t('failedToMovePost');
  return t('failedToAddPost');
}

// Export/import live on the saved-posts page only — the popup is for saving the
// current page. handleExport/handleImport were removed with their buttons.

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
