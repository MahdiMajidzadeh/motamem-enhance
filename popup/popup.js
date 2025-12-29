// Popup script

let currentTab = null;
let currentUrl = null;

// Initialize popup
async function init() {
  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    currentTab = tabs[0];
    currentUrl = tabs[0].url;
    
    // Check if on Motammem domain
    try {
      const url = new URL(currentUrl);
      if (url.hostname.includes('motamem.org')) {
        checkCurrentPageStatus();
      } else {
        showStatus('Not on Motammem blog', false);
        disableActions();
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

