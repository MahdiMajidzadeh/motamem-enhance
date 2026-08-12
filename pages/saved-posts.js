// Saved posts page script

let currentTab = 'toRead';
let currentPage = 1;
const pageSize = 20;
let allLabels = [];        // known label names, across both lists (creation order — drives color assignment)
let activeLabelFilter = null;
let searchQuery = '';
let searchDebounceTimer = null;
let openPopover = null;    // { el, closeHandler } for the currently open label popover, if any
let statsMonth = null;     // 'YYYY-MM' currently shown on the Stats tab

// Sentinel the background returns for posts with no label (language-neutral;
// translated here to whichever language is active).
const UNCATEGORIZED_KEY = '__uncategorized__';

const t = (key, vars) => (window.MMI18n ? window.MMI18n.t(key, vars) : key);
const n = (value) => (window.MMI18n ? window.MMI18n.n(value) : String(value));

// ── Theme switcher ─────────────────────────────────
// Mirrors popup.js's toggle so both surfaces behave identically.
const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_ICONS = {
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
};

function updateThemeToggle(theme) {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.innerHTML = THEME_ICONS[theme] || THEME_ICONS.system;
  const labelKey = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' }[theme] || 'themeSystem';
  const label = t(labelKey);
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
    refreshDynamicText();
  });
}

// Re-render whatever's on screen so a language switch doesn't leave stale
// text/numbers around (data-i18n elements are handled by MMI18n itself).
function refreshDynamicText() {
  loadTabCounts();
  renderLabelFilterBar();
  const statsVisible = document.getElementById('stats-view').style.display !== 'none';
  if (statsVisible) {
    loadStats();
  } else {
    loadPosts();
  }
}

// Initialize page
async function init() {
  if (window.MMI18n) window.MMI18n.translatePage();
  setupThemeToggle();
  setupLangToggle();

  // Keep this tab's theme in sync if it's changed from the popup while open.
  // (theme.js already applied the stored theme before paint.)
  window.addEventListener('storage', (e) => {
    if (e.key === (window.MMTheme && window.MMTheme.KEY) && window.MMTheme) {
      window.MMTheme.apply(window.MMTheme.get());
    }
  });

  // Best-effort cross-surface language sync (e.g. changed from the popup).
  window.addEventListener('mm-i18n-ready', () => {
    updateThemeToggle(window.MMTheme ? window.MMTheme.get() : 'system');
    updateLangToggle(window.MMI18n ? window.MMI18n.get() : 'fa');
    refreshDynamicText();
  });

  setupEventListeners();
  loadTabCounts();
  await loadLabels();
  await loadPosts();
}

// Setup event listeners
function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
  
  // Export
  document.getElementById('export-btn').addEventListener('click', handleExport);
  
  // Import
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  
  document.getElementById('import-file').addEventListener('change', handleImport);

  // Search
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  searchInput.addEventListener('input', () => {
    searchClear.style.display = searchInput.value ? 'grid' : 'none';
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchQuery = searchInput.value.trim();
      currentPage = 1;
      loadPosts();
    }, 300);
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    searchQuery = '';
    currentPage = 1;
    loadPosts();
    searchInput.focus();
  });

  // Stats month navigation
  document.getElementById('stats-prev').addEventListener('click', () => {
    statsMonth = shiftMonthKey(statsMonth || currentMonthKey(), -1);
    loadStats();
  });
  document.getElementById('stats-next').addEventListener('click', () => {
    const next = shiftMonthKey(statsMonth || currentMonthKey(), 1);
    if (next > currentMonthKey()) return; // no navigating into the future
    statsMonth = next;
    loadStats();
  });
}

// Switch tab
async function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  if (tab === 'stats') {
    closeLabelPopover();
    document.getElementById('label-filter-bar').style.display = 'none';
    document.querySelector('.search-bar').style.display = 'none';
    document.getElementById('list-view').style.display = 'none';
    document.getElementById('stats-view').style.display = 'block';
    await loadStats();
    return;
  }

  currentTab = tab;
  currentPage = 1;
  document.getElementById('stats-view').style.display = 'none';
  document.querySelector('.search-bar').style.display = '';
  document.getElementById('list-view').style.display = '';
  renderLabelFilterBar();
  await loadPosts();
}

// ── Label colors ───────────────────────────────────────────────────────
// Colors are assigned by each label's position in the shared `allLabels`
// list (creation order, from storage) using labelColorForIndex — a
// golden-angle hue step (shared/utils.js) that guarantees every label gets
// a visually distinct color, unlike hashing into a small fixed palette.
function labelColor(name) {
  const idx = allLabels.findIndex(l => l.toLowerCase() === name.toLowerCase());
  if (idx >= 0) return labelColorForIndex(idx);
  // Not in the known list yet (e.g. brand new, not synced back) — still
  // give it *a* stable, well-spread color rather than a fixed fallback.
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return labelColorForIndex(hash % 997);
}

// ── Labels ──────────────────────────────────────────────────────────────

// Load the global list of known labels and render the filter bar
async function loadLabels() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getLabels' });
    if (response.success) {
      allLabels = response.labels;
      renderLabelFilterBar();
    }
  } catch (error) {
    console.error('Error loading labels:', error);
  }
}

// Render the row of label chips used to filter the current tab's posts
function renderLabelFilterBar() {
  const bar = document.getElementById('label-filter-bar');
  bar.innerHTML = '';

  if (allLabels.length === 0) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'label-filter-chip' + (activeLabelFilter === null ? ' active' : '');
  allChip.textContent = t('labelFilterAll');
  allChip.addEventListener('click', () => setLabelFilter(null));
  bar.appendChild(allChip);

  allLabels.forEach(name => {
    const active = !!(activeLabelFilter && activeLabelFilter.toLowerCase() === name.toLowerCase());

    // A div housing two buttons (select + delete) — avoids nesting a button
    // for delete inside a button for selection.
    const chip = document.createElement('div');
    chip.className = 'label-filter-chip' + (active ? ' active' : '');
    chip.style.setProperty('--chip-color', labelColor(name));

    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = 'label-filter-select';
    selectBtn.addEventListener('click', () => setLabelFilter(name));

    const dot = document.createElement('span');
    dot.className = 'dot';
    if (!active) dot.style.background = labelColor(name);

    const label = document.createElement('span');
    label.textContent = name;
    label.dir = 'auto';

    selectBtn.appendChild(dot);
    selectBtn.appendChild(label);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'label-filter-delete';
    deleteBtn.textContent = '×';
    deleteBtn.setAttribute('aria-label', t('deleteLabelAria', { name }));
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteLabel(name);
    });

    chip.appendChild(selectBtn);
    chip.appendChild(deleteBtn);
    bar.appendChild(chip);
  });
}

async function setLabelFilter(name) {
  activeLabelFilter = name;
  currentPage = 1;
  renderLabelFilterBar();
  await loadPosts();
}

// Delete a label entirely (from every post, in both lists)
async function handleDeleteLabel(name) {
  closeLabelPopover();
  if (!confirm(t('deleteLabelConfirm', { name }))) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ action: 'deleteLabel', name });
    if (response.success) {
      if (activeLabelFilter && activeLabelFilter.toLowerCase() === name.toLowerCase()) {
        activeLabelFilter = null;
      }
      await loadLabels();
      await loadPosts();
      showNotification(t('labelDeleted', { name }), 'success');
    } else {
      showNotification(response.error || t('failedToDeleteLabel'), 'error');
    }
  } catch (error) {
    showNotification(t('errorPrefix') + error.message, 'error');
  }
}

// Build a small colored chip for a label. When `removable` is true, includes
// an "x" button that removes the label from `post` and re-renders that card.
function createLabelChip(name, post, { removable = false } = {}) {
  const chip = document.createElement('span');
  chip.className = 'label-chip';
  chip.style.setProperty('--chip-color', labelColor(name));

  const dot = document.createElement('span');
  dot.className = 'dot';
  chip.appendChild(dot);

  const text = document.createElement('span');
  text.textContent = name;
  text.dir = 'auto';
  chip.appendChild(text);

  if (removable) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove';
    removeBtn.type = 'button';
    removeBtn.setAttribute('aria-label', t('removeLabelAria', { name }));
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await togglePostLabel(post, name, false);
    });
    chip.appendChild(removeBtn);
  }

  return chip;
}

// Persist an add/remove of a single label on a post, then refresh its card
// and the popover (if still open) in place — no full page reload needed.
async function togglePostLabel(post, name, shouldHave) {
  const current = Array.isArray(post.labels) ? post.labels : [];
  const has = current.some(l => l.toLowerCase() === name.toLowerCase());
  if (has === shouldHave) return;

  const nextLabels = shouldHave
    ? [...current, name]
    : current.filter(l => l.toLowerCase() !== name.toLowerCase());

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'setPostLabels',
      url: post.url,
      listType: currentTab,
      labels: nextLabels
    });

    if (!response.success) {
      showNotification(response.error || t('failedToUpdateLabels'), 'error');
      return;
    }

    post.labels = response.post.labels;

    // A brand-new label name may have been registered globally — refresh the
    // known list (and filter bar) if so.
    if (!allLabels.some(l => l.toLowerCase() === name.toLowerCase())) {
      await loadLabels();
    }

    refreshPostCard(post);
    if (openPopover && openPopover.post === post) {
      renderPopoverOptions(post);
    }

    // If we're filtered to a label and just removed the last matching post
    // from view, reload so the list (and pagination) stay accurate.
    if (activeLabelFilter && !shouldHave && activeLabelFilter.toLowerCase() === name.toLowerCase()) {
      await loadPosts();
    }
  } catch (error) {
    showNotification(t('errorPrefix') + error.message, 'error');
  }
}

// Re-render just one post card's labels row + label button state, without
// touching the rest of the list or losing scroll position.
function refreshPostCard(post) {
  const card = document.querySelector(`.post-item[data-url="${cssEscape(post.url)}"]`);
  if (!card) return;

  const labelsRow = card.querySelector('.post-labels');
  if (labelsRow) {
    labelsRow.innerHTML = '';
    (post.labels || []).forEach(name => {
      labelsRow.appendChild(createLabelChip(name, post, { removable: true }));
    });
  }

  const labelBtn = card.querySelector('.label-btn');
  if (labelBtn) {
    labelBtn.classList.toggle('has-labels', (post.labels || []).length > 0);
  }
}

// CSS.escape isn't guaranteed available in every context; small local shim.
function cssEscape(value) {
  return (window.CSS && CSS.escape) ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}

// Close any open label popover
function closeLabelPopover() {
  if (!openPopover) return;
  document.removeEventListener('mousedown', openPopover.outsideHandler, true);
  document.removeEventListener('keydown', openPopover.escHandler, true);
  openPopover.el.remove();
  openPopover = null;
}

// Fill in (or refresh) the checkbox list inside an open popover
function renderPopoverOptions(post) {
  if (!openPopover) return;
  const list = openPopover.el.querySelector('.label-popover-list');
  list.innerHTML = '';

  if (allLabels.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'label-empty-hint';
    hint.textContent = t('noLabelsHint');
    list.appendChild(hint);
    return;
  }

  const currentLabels = post.labels || [];

  allLabels.forEach(name => {
    const row = document.createElement('label');
    row.className = 'label-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = currentLabels.some(l => l.toLowerCase() === name.toLowerCase());
    checkbox.addEventListener('change', () => togglePostLabel(post, name, checkbox.checked));

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = labelColor(name);

    const nameEl = document.createElement('span');
    nameEl.className = 'name';
    nameEl.textContent = name;
    nameEl.dir = 'auto';

    row.appendChild(checkbox);
    row.appendChild(dot);
    row.appendChild(nameEl);
    list.appendChild(row);
  });
}

// Open the "assign labels" popover anchored to a post's Label button
function openLabelPopover(anchorBtn, post) {
  if (openPopover && openPopover.post === post) {
    closeLabelPopover();
    return;
  }
  closeLabelPopover();

  const popover = document.createElement('div');
  popover.className = 'label-popover';

  const title = document.createElement('div');
  title.className = 'label-popover-title';
  title.textContent = t('labelPopoverTitle');
  popover.appendChild(title);

  const list = document.createElement('div');
  list.className = 'label-popover-list';
  popover.appendChild(list);

  const form = document.createElement('div');
  form.className = 'label-popover-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = t('newLabelPlaceholder');
  input.maxLength = 24;
  input.dir = 'auto';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = t('add');

  const submit = async () => {
    const name = input.value.trim();
    if (!name) return;
    addBtn.disabled = true;
    await togglePostLabel(post, name, true);
    addBtn.disabled = false;
    input.value = '';
    input.focus();
  };

  addBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  form.appendChild(input);
  form.appendChild(addBtn);
  popover.appendChild(form);

  document.body.appendChild(popover);

  // Position under the anchor button, kept within the viewport horizontally.
  const rect = anchorBtn.getBoundingClientRect();
  const popoverWidth = popover.offsetWidth;
  let left = rect.left + window.scrollX;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - popoverWidth - 12;
  left = Math.min(left, maxLeft);
  left = Math.max(left, window.scrollX + 12);
  popover.style.top = `${rect.bottom + window.scrollY + 8}px`;
  popover.style.left = `${left}px`;

  const outsideHandler = (e) => {
    if (!popover.contains(e.target) && e.target !== anchorBtn) {
      closeLabelPopover();
    }
  };
  const escHandler = (e) => {
    if (e.key === 'Escape') closeLabelPopover();
  };
  document.addEventListener('mousedown', outsideHandler, true);
  document.addEventListener('keydown', escHandler, true);

  openPopover = { el: popover, post, outsideHandler, escHandler };
  renderPopoverOptions(post);
  input.focus();
}

// ── Notes ───────────────────────────────────────────────────────────────

// Build the always-present note section for a post card: either a compact
// "Add note" prompt, or the saved note with an Edit button.
function buildNoteSection(post) {
  const wrap = document.createElement('div');
  wrap.className = 'post-note';
  renderNoteDisplay(wrap, post);
  return wrap;
}

function renderNoteDisplay(container, post) {
  container.innerHTML = '';

  if (post.note) {
    const display = document.createElement('div');
    display.className = 'note-display';

    const icon = document.createElement('span');
    icon.className = 'note-icon';
    icon.textContent = '📝';

    const text = document.createElement('span');
    text.className = 'note-text';
    text.textContent = post.note;
    text.dir = 'auto';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'note-edit-btn';
    editBtn.textContent = t('noteEdit');
    editBtn.addEventListener('click', () => renderNoteEditor(container, post));

    display.appendChild(icon);
    display.appendChild(text);
    display.appendChild(editBtn);
    container.appendChild(display);
  } else {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'note-add-btn';
    addBtn.textContent = t('noteAdd');
    addBtn.addEventListener('click', () => renderNoteEditor(container, post));
    container.appendChild(addBtn);
  }
}

function renderNoteEditor(container, post) {
  container.innerHTML = '';

  const editor = document.createElement('div');
  editor.className = 'note-editor';

  const textarea = document.createElement('textarea');
  textarea.className = 'note-textarea';
  textarea.value = post.note || '';
  textarea.maxLength = 2000;
  textarea.dir = 'auto';
  textarea.rows = 3;
  textarea.placeholder = t('notePlaceholder');

  const actionsRow = document.createElement('div');
  actionsRow.className = 'note-editor-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary btn-small';
  saveBtn.textContent = t('save');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    await saveNote(post, textarea.value.trim());
    saveBtn.disabled = false;
    renderNoteDisplay(container, post);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary btn-small';
  cancelBtn.textContent = t('cancel');
  cancelBtn.addEventListener('click', () => renderNoteDisplay(container, post));

  actionsRow.appendChild(saveBtn);
  actionsRow.appendChild(cancelBtn);

  editor.appendChild(textarea);
  editor.appendChild(actionsRow);
  container.appendChild(editor);
  textarea.focus();
}

async function saveNote(post, noteText) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'setPostNote',
      url: post.url,
      listType: currentTab,
      note: noteText
    });

    if (response.success) {
      post.note = response.post.note;
    } else {
      showNotification(response.error || t('failedToSaveNote'), 'error');
    }
  } catch (error) {
    showNotification(t('errorPrefix') + error.message, 'error');
  }
}

// ── Stats ───────────────────────────────────────────────────────────────

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonthKey(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Deliberately Gregorian even in Persian, unlike formatDate() in shared/utils.js
// which now uses Jalali. The Stats tab buckets posts by Gregorian month
// (monthKeyOf in shared/storage.js keys on getFullYear/getMonth), and a Jalali
// month straddles two Gregorian ones — labelling the August bucket "مرداد" would
// claim a range the numbers don't cover. Making these Jalali means re-keying the
// buckets themselves, not just relabelling.
function currentLocale() {
  return (window.MMI18n && window.MMI18n.get() === 'fa') ? 'fa-IR-u-ca-gregory' : 'en-US';
}

function formatMonthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' });
}

async function loadStats() {
  if (!statsMonth) statsMonth = currentMonthKey();

  document.getElementById('stats-month-label').textContent = formatMonthLabel(statsMonth);
  document.getElementById('stats-next').disabled = statsMonth >= currentMonthKey();

  const emptyEl = document.getElementById('stats-empty');
  const chartEl = document.getElementById('stats-chart');
  const summaryEl = document.getElementById('stats-summary');
  const legendEl = document.querySelector('.stats-legend');
  const breakdownTitleEl = document.getElementById('stats-trend-title');

  try {
    const statsResp = await chrome.runtime.sendMessage({ action: 'getMonthlyStats', month: statsMonth });

    if (!statsResp.success) {
      showNotification(statsResp.error || t('failedToLoadStats'), 'error');
      return;
    }

    const data = statsResp.data;
    const monthTotal = data.totalRead + data.totalUnread;

    if (monthTotal === 0) {
      emptyEl.style.display = 'block';
      chartEl.style.display = 'none';
      summaryEl.style.display = 'none';
      legendEl.style.display = 'none';
      breakdownTitleEl.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    chartEl.style.display = 'flex';
    summaryEl.style.display = 'flex';
    legendEl.style.display = 'flex';
    breakdownTitleEl.style.display = 'block';

    renderStatsSummary(data);
    renderStatsBreakdown(data);
  } catch (error) {
    showNotification(t('errorPrefix') + error.message, 'error');
  }
}

function renderStatsSummary(data) {
  const summary = document.getElementById('stats-summary');
  summary.innerHTML = '';
  summary.appendChild(buildStatCard(t('statTotalSaved'), n(data.totalRead + data.totalUnread), ''));
  summary.appendChild(buildStatCard(t('statRead'), n(data.totalRead), 'read'));
  summary.appendChild(buildStatCard(t('statUnread'), n(data.totalUnread), 'unread'));
}

function buildStatCard(title, valueText, variant) {
  const card = document.createElement('div');
  card.className = 'stat-card' + (variant ? ` stat-card-${variant}` : '');

  const num = document.createElement('div');
  num.className = 'stat-card-value';
  num.textContent = valueText;

  const label = document.createElement('div');
  label.className = 'stat-card-label';
  label.textContent = title;

  card.appendChild(num);
  card.appendChild(label);
  return card;
}

// ── Stacked column chart: Read vs Unread, each column stacked and colored
// by label, with a percentage on every segment big enough to hold text. ──
const STACK_PLOT_HEIGHT = 240; // px, the tallest a full column can be

function labelDisplayName(name) {
  return name === UNCATEGORIZED_KEY ? t('uncategorized') : name;
}

function labelSegmentColor(name) {
  return name === UNCATEGORIZED_KEY ? 'var(--text-secondary)' : labelColor(name);
}

// Build one stacked column (bottom → top) for either the read or unread
// side, given the shared max value the two columns are scaled against.
function buildStackColumn(data, kind, maxValue) {
  const total = kind === 'read' ? data.totalRead : data.totalUnread;
  const colWrap = document.createElement('div');
  colWrap.className = 'stats-stack-col-wrap';

  const totalEl = document.createElement('div');
  totalEl.className = 'stats-stack-col-total';
  totalEl.textContent = n(total);

  const col = document.createElement('div');
  col.className = 'stats-stack-col';
  const colHeight = maxValue > 0 ? Math.max((total / maxValue) * STACK_PLOT_HEIGHT, total > 0 ? 3 : 0) : 0;
  col.style.height = `${colHeight}px`;

  // Segments in the same order for both columns (data.labels is already
  // sorted by overall activity), so matching labels line up visually.
  data.labels.forEach(l => {
    const count = kind === 'read' ? l.read : l.unread;
    if (count <= 0) return;

    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const segHeight = (count / total) * colHeight;

    const seg = document.createElement('div');
    seg.className = 'stats-stack-segment';
    seg.style.height = `${segHeight}px`;
    seg.style.background = labelSegmentColor(l.name);
    seg.title = `${labelDisplayName(l.name)} — ${n(count)} (${n(pct)}%)`;

    // Only print the count inside the segment if there's room for it;
    // otherwise it's still available via the title tooltip and the legend.
    if (segHeight >= 16) {
      const countEl = document.createElement('span');
      countEl.className = 'count';
      countEl.textContent = n(count);
      seg.appendChild(countEl);
    }

    col.appendChild(seg);
  });

  const titleEl = document.createElement('div');
  titleEl.className = 'stats-stack-col-title';
  titleEl.textContent = kind === 'read' ? t('statsLegendRead') : t('statsLegendUnread');

  colWrap.appendChild(totalEl);
  colWrap.appendChild(col);
  colWrap.appendChild(titleEl);
  return colWrap;
}

function buildStackLegend(data) {
  const legend = document.createElement('div');
  legend.className = 'stats-stack-legend';

  data.labels.forEach(l => {
    const row = document.createElement('div');
    row.className = 'stats-stack-legend-row';

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = labelSegmentColor(l.name);

    const nameEl = document.createElement('span');
    nameEl.className = 'stats-stack-legend-name';
    nameEl.textContent = labelDisplayName(l.name);
    nameEl.dir = 'auto';

    const readEl = document.createElement('span');
    readEl.className = 'stats-stack-legend-figure read';
    readEl.textContent = `${t('statsLegendRead')}: ${n(l.read)}`;

    const unreadEl = document.createElement('span');
    unreadEl.className = 'stats-stack-legend-figure unread';
    unreadEl.textContent = `${t('statsLegendUnread')}: ${n(l.unread)}`;

    row.appendChild(dot);
    row.appendChild(nameEl);
    row.appendChild(readEl);
    row.appendChild(unreadEl);
    legend.appendChild(row);
  });

  return legend;
}

function renderStatsBreakdown(data) {
  const container = document.getElementById('stats-chart');
  const titleEl = document.getElementById('stats-trend-title');
  container.innerHTML = '';

  titleEl.textContent = t('statsBreakdownTitle');

  const maxValue = Math.max(1, data.totalRead, data.totalUnread);

  const wrap = document.createElement('div');
  wrap.className = 'stats-stacked-wrap';
  wrap.appendChild(buildStackColumn(data, 'read', maxValue));
  wrap.appendChild(buildStackColumn(data, 'unread', maxValue));
  container.appendChild(wrap);

  container.appendChild(buildStackLegend(data));
}

// Load tab counts
async function loadTabCounts() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getCounts' });
    if (response.success) {
      document.getElementById('toread-tab-count').textContent = n(response.counts.toRead);
      document.getElementById('read-tab-count').textContent = n(response.counts.read);
    }
  } catch (error) {
    console.error('Error loading counts:', error);
  }
}

// Load posts
async function loadPosts() {
  showLoading();
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getAllPosts',
      listType: currentTab,
      page: currentPage,
      pageSize: pageSize,
      labelFilter: activeLabelFilter,
      searchQuery: searchQuery
    });
    
    if (response.success) {
      const { posts, total, page, totalPages } = response.data;
      
      if (total === 0) {
        showEmptyState();
      } else {
        renderPosts(posts);
        renderPagination(page, totalPages, total);
      }
    } else {
      showError(t('failedToLoadPosts'));
    }
  } catch (error) {
    showError(t('errorPrefix') + error.message);
  }
}

// Show loading state
function showLoading() {
  document.getElementById('loading').style.display = 'flex';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('posts-list').style.display = 'none';
  document.getElementById('pagination').style.display = 'none';
}

// Show empty state — text differs for "nothing saved yet" vs "no results
// for the current search/label filter".
function showEmptyState() {
  closeLabelPopover();
  document.getElementById('loading').style.display = 'none';
  document.getElementById('empty-state').style.display = 'block';
  document.getElementById('posts-list').style.display = 'none';
  document.getElementById('pagination').style.display = 'none';

  const titleEl = document.getElementById('empty-state-title');
  const descEl = document.getElementById('empty-state-desc');
  if (searchQuery || activeLabelFilter) {
    titleEl.textContent = t('noResultsTitle');
    descEl.textContent = t('noResultsDesc');
  } else {
    titleEl.textContent = t('noPostsYetTitle');
    descEl.textContent = t('noPostsYetDesc');
  }
}

// Render posts
function renderPosts(posts) {
  closeLabelPopover();
  const listEl = document.getElementById('posts-list');
  listEl.innerHTML = '';
  
  posts.forEach(post => {
    const item = createPostItem(post);
    listEl.appendChild(item);
  });
  
  document.getElementById('loading').style.display = 'none';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('posts-list').style.display = 'grid';
}

// Only allow http(s) links so a malicious href (e.g. javascript:) can't execute.
function safeHref(url) {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '#';
  } catch {
    return '#';
  }
}

// Create post item element.
// Built with DOM APIs / textContent rather than innerHTML: post.title and
// post.url are untrusted (they can come from imported JSON) and must never be
// interpreted as HTML.
function createPostItem(post) {
  const item = document.createElement('div');
  item.className = 'post-item';
  item.dataset.url = post.url;

  const title = truncateText(post.title, 80);
  const formattedDate = formatDate(post.addedAt, window.MMI18n ? window.MMI18n.get() : 'fa');
  const href = safeHref(post.url);

  const header = document.createElement('div');
  header.className = 'post-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'post-title';
  const titleLink = document.createElement('a');
  titleLink.href = href;
  titleLink.target = '_blank';
  titleLink.rel = 'noopener';
  titleLink.dir = 'auto'; // let the browser pick LTR/RTL per title (posts are Persian)
  titleLink.textContent = title;
  titleWrap.appendChild(titleLink);

  const actions = document.createElement('div');
  actions.className = 'post-actions';

  const moveBtn = document.createElement('button');
  moveBtn.className = 'btn btn-primary btn-small move-btn';
  moveBtn.textContent = currentTab === 'toRead' ? t('markAsRead') : t('moveToToRead');
  moveBtn.addEventListener('click', () => handleMove(post.url));

  const labelBtn = document.createElement('button');
  labelBtn.className = 'btn btn-secondary btn-small label-btn';
  if ((post.labels || []).length > 0) labelBtn.classList.add('has-labels');
  labelBtn.textContent = t('labelBtn');
  labelBtn.addEventListener('click', () => openLabelPopover(labelBtn, post));

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn btn-danger btn-small remove-btn';
  removeBtn.textContent = t('remove');
  removeBtn.addEventListener('click', () => handleRemove(post.url));

  actions.appendChild(moveBtn);
  actions.appendChild(labelBtn);
  actions.appendChild(removeBtn);

  header.appendChild(titleWrap);
  header.appendChild(actions);

  const labelsRow = document.createElement('div');
  labelsRow.className = 'post-labels';
  (post.labels || []).forEach(name => {
    labelsRow.appendChild(createLabelChip(name, post, { removable: true }));
  });

  const noteSection = buildNoteSection(post);

  const meta = document.createElement('div');
  meta.className = 'post-meta';

  // No domain shown: every saved post is from motamem.org, so it carried no
  // information. The title itself is the link.
  const dateSpan = document.createElement('span');
  dateSpan.className = 'post-date';
  dateSpan.textContent = `📅 ${formattedDate}`;

  meta.appendChild(dateSpan);

  item.appendChild(header);
  item.appendChild(labelsRow); // always present (even empty) so labels can be added in place later
  item.appendChild(noteSection);
  item.appendChild(meta);

  return item;
}

// Render pagination
function renderPagination(page, totalPages, total) {
  const paginationEl = document.getElementById('pagination');
  
  if (totalPages <= 1) {
    paginationEl.style.display = 'none';
    return;
  }
  
  paginationEl.style.display = 'flex';
  
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  
  paginationEl.innerHTML = `
    <button class="pagination-btn" id="prev-btn" ${page === 1 ? 'disabled' : ''}>
      ${t('paginationPrev')}
    </button>
    <span class="pagination-info">
      ${t('paginationInfo', { start: n(start), end: n(end), total: n(total) })}
    </span>
    <button class="pagination-btn" id="next-btn" ${page === totalPages ? 'disabled' : ''}>
      ${t('paginationNext')}
    </button>
  `;
  
  // Add event listeners
  document.getElementById('prev-btn').addEventListener('click', () => {
    if (page > 1) {
      currentPage = page - 1;
      loadPosts();
    }
  });
  
  document.getElementById('next-btn').addEventListener('click', () => {
    if (page < totalPages) {
      currentPage = page + 1;
      loadPosts();
    }
  });
}

// Handle remove
async function handleRemove(url) {
  if (!confirm(t('removeConfirm'))) {
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'removeFromList',
      url,
      listType: currentTab
    });
    
    if (response.success) {
      showNotification(t('postRemoved'), 'success');
      loadTabCounts();
      await loadPosts();
    } else {
      showNotification(response.error || t('failedToRemovePost'), 'error');
    }
  } catch (error) {
    showNotification(t('errorPrefix') + error.message, 'error');
  }
}

// Handle move
async function handleMove(url) {
  const fromList = currentTab;
  const toList = currentTab === 'toRead' ? 'read' : 'toRead';
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'movePost',
      url,
      fromList,
      toList
    });
    
    if (response.success) {
      showNotification(t('movedToList', { list: toList === 'toRead' ? t('toRead') : t('read') }), 'success');
      loadTabCounts();
      await loadPosts();
    } else {
      showNotification(response.error || t('failedToMovePost'), 'error');
    }
  } catch (error) {
    showNotification(t('errorPrefix') + error.message, 'error');
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
      a.download = `motamem-saved-posts-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showNotification(t('exportSuccessful'), 'success');
    } else {
      showNotification(t('exportFailed'), 'error');
    }
  } catch (error) {
    showNotification(t('errorPrefix') + error.message, 'error');
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
        t('importedPosts', { imported: n(response.result.imported), skipped: n(response.result.skipped) }),
        'success'
      );
      loadTabCounts();
      await loadLabels();
      await loadPosts();
      // Reset file input
      event.target.value = '';
    } else {
      showNotification(response.error || t('importFailed'), 'error');
    }
  } catch (error) {
    showNotification(t('errorPrefix') + error.message, 'error');
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

// Show error
function showError(message) {
  document.getElementById('loading').style.display = 'none';
  showNotification(message, 'error');
}

// Initialize on load
init();
