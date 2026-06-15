// Saved posts page script

let currentTab = 'toRead';
let currentPage = 1;
const pageSize = 20;

// Initialize page
async function init() {
  // Keep this tab's theme in sync if it's changed from the popup while open.
  // (theme.js already applied the stored theme before paint.)
  window.addEventListener('storage', (e) => {
    if (e.key === (window.MMTheme && window.MMTheme.KEY) && window.MMTheme) {
      window.MMTheme.apply(window.MMTheme.get());
    }
  });

  setupEventListeners();
  loadTabCounts();
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
}

// Switch tab
async function switchTab(tab) {
  currentTab = tab;
  currentPage = 1;
  
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  
  await loadPosts();
}

// Load tab counts
async function loadTabCounts() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getCounts' });
    if (response.success) {
      document.getElementById('toread-tab-count').textContent = response.counts.toRead;
      document.getElementById('read-tab-count').textContent = response.counts.read;
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
      pageSize: pageSize
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
      showError('Failed to load posts');
    }
  } catch (error) {
    showError('Error: ' + error.message);
  }
}

// Show loading state
function showLoading() {
  document.getElementById('loading').style.display = 'flex';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('posts-list').style.display = 'none';
  document.getElementById('pagination').style.display = 'none';
}

// Show empty state
function showEmptyState() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('empty-state').style.display = 'block';
  document.getElementById('posts-list').style.display = 'none';
  document.getElementById('pagination').style.display = 'none';
}

// Render posts
function renderPosts(posts) {
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

  const title = truncateText(post.title, 80);
  const formattedDate = formatDate(post.addedAt);
  const domain = getDomain(post.url);
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
  moveBtn.textContent = currentTab === 'toRead' ? 'Mark as Read' : 'Move to To Read';
  moveBtn.addEventListener('click', () => handleMove(post.url));

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn btn-danger btn-small remove-btn';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => handleRemove(post.url));

  actions.appendChild(moveBtn);
  actions.appendChild(removeBtn);

  header.appendChild(titleWrap);
  header.appendChild(actions);

  const meta = document.createElement('div');
  meta.className = 'post-meta';

  const urlLink = document.createElement('a');
  urlLink.href = href;
  urlLink.target = '_blank';
  urlLink.rel = 'noopener';
  urlLink.className = 'post-url';
  urlLink.textContent = domain;

  const dateSpan = document.createElement('span');
  dateSpan.className = 'post-date';
  dateSpan.textContent = `📅 ${formattedDate}`;

  meta.appendChild(urlLink);
  meta.appendChild(dateSpan);

  item.appendChild(header);
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
      ← Previous
    </button>
    <span class="pagination-info">
      ${start}-${end} of ${total}
    </span>
    <button class="pagination-btn" id="next-btn" ${page === totalPages ? 'disabled' : ''}>
      Next →
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
  if (!confirm('Are you sure you want to remove this post?')) {
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'removeFromList',
      url,
      listType: currentTab
    });
    
    if (response.success) {
      showNotification('Post removed', 'success');
      loadTabCounts();
      await loadPosts();
    } else {
      showNotification(response.error || 'Failed to remove post', 'error');
    }
  } catch (error) {
    showNotification('Error: ' + error.message, 'error');
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
      showNotification(`Moved to ${toList === 'toRead' ? 'To Read' : 'Read'} list`, 'success');
      loadTabCounts();
      await loadPosts();
    } else {
      showNotification(response.error || 'Failed to move post', 'error');
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
      loadTabCounts();
      await loadPosts();
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

// Show error
function showError(message) {
  document.getElementById('loading').style.display = 'none';
  showNotification(message, 'error');
}

// Initialize on load
init();

