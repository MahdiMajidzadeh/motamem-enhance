// Content script for injecting UI and handling link hover

(function() {
  'use strict';
  
  // Check if script already injected
  if (window.motammemEnhancerInjected) {
    return;
  }
  window.motammemEnhancerInjected = true;
  
  // Get current page info
  const currentUrl = window.location.href;
  const currentTitle = document.title || '';
  
  // Create floating action buttons
  function createFloatingButtons() {
    // Remove existing buttons if any
    const existing = document.getElementById('motammem-enhancer-buttons');
    if (existing) existing.remove();
    
    const container = document.createElement('div');
    container.id = 'motammem-enhancer-buttons';
    container.className = 'motammem-enhancer-container';
    
    const toReadBtn = document.createElement('button');
    toReadBtn.className = 'motammem-btn motammem-btn-toread';
    toReadBtn.innerHTML = '<span>📖</span> To Read';
    toReadBtn.title = 'Add to To Read list';
    
    const readBtn = document.createElement('button');
    readBtn.className = 'motammem-btn motammem-btn-read';
    readBtn.innerHTML = '<span>✓</span> Read';
    readBtn.title = 'Add to Read list';
    
    container.appendChild(toReadBtn);
    container.appendChild(readBtn);
    document.body.appendChild(container);
    
    // Check current status
    checkPostStatus();
    
    // Add event listeners
    toReadBtn.addEventListener('click', () => handleAddToList('toRead'));
    readBtn.addEventListener('click', () => handleAddToList('read'));
  }
  
  // Check if current post is already saved
  async function checkPostStatus() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getPostStatus',
        url: currentUrl
      });
      
      if (response.success && response.status) {
        const container = document.getElementById('motammem-enhancer-buttons');
        if (container) {
          if (response.status === 'toRead') {
            container.classList.add('status-toread');
            container.querySelector('.motammem-btn-toread').classList.add('active');
          } else if (response.status === 'read') {
            container.classList.add('status-read');
            container.querySelector('.motammem-btn-read').classList.add('active');
          }
        }
      }
    } catch (error) {
      console.error('Error checking post status:', error);
    }
  }
  
  // Handle adding to list
  async function handleAddToList(listType) {
    try {
      const title = extractPostTitle();
      const action = listType === 'toRead' ? 'addToRead' : 'addToReadList';
      
      const response = await chrome.runtime.sendMessage({
        action,
        url: currentUrl,
        title
      });
      
      if (response.success) {
        showNotification(`Added to ${listType === 'toRead' ? 'To Read' : 'Read'} list`);
        checkPostStatus();
      } else {
        showNotification(response.error || 'Failed to add post', true);
      }
    } catch (error) {
      showNotification('Error: ' + error.message, true);
    }
  }
  
  // Extract post title from page
  function extractPostTitle() {
    // Try various selectors for post title
    const selectors = [
      'h1',
      'article h1',
      '.post-title',
      '.entry-title',
      '[class*="title"]',
      'title'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }
    
    return document.title || currentUrl;
  }
  
  // Show notification
  function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = `motammem-notification ${isError ? 'error' : 'success'}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }
  
  // Decide whether a link points at a saveable post, so the hover tooltip
  // doesn't pop up on navigation, pagination, archives, assets, or the page
  // we're already on. motamem.org serves content at single-segment slugs
  // (e.g. /some-slug/); these are the paths that are clearly NOT posts.
  const NON_POST_PATTERNS = [
    /^\/page\//i,                                   // pagination: /page/2/
    /^\/(wp-admin|wp-includes|wp-json|wp-content)/i, // WP internals & uploads
    /^\/(wp-login|xmlrpc)\.php/i,                    // WP system endpoints
    /\/feed\/?$/i,                                   // RSS feeds (site or per-post)
    /^\/(category|tag|author)\//i,                   // archive pages (defensive)
    /^\/search\//i
  ];
  const ASSET_EXT = /\.(jpe?g|png|gif|svg|webp|bmp|ico|pdf|zip|rar|mp3|mp4|wav|css|js|xml|json|txt)$/i;

  function isPostUrl(linkEl) {
    let url;
    try {
      url = new URL(linkEl.href);
    } catch {
      return false;
    }

    // Only http(s) links on the same host as the current page.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (url.hostname !== window.location.hostname) return false;

    const path = url.pathname;

    // Homepage or pathless link.
    if (path.length <= 1) return false;

    // In-page anchor to the post we're already reading.
    if (path === window.location.pathname && url.search === window.location.search) return false;

    // Search results, known non-content paths, or asset files.
    if (url.searchParams.has('s')) return false;
    if (NON_POST_PATTERNS.some(re => re.test(path))) return false;
    if (ASSET_EXT.test(path)) return false;

    return true;
  }

  // Link hover functionality
  let hoverTooltip = null;
  let hoverTimeout = null;
  
  function createHoverTooltip(link) {
    // Remove existing tooltip
    if (hoverTooltip) {
      hoverTooltip.remove();
    }
    
    const tooltip = document.createElement('div');
    tooltip.className = 'motammem-hover-tooltip';
    tooltip.innerHTML = `
      <button class="motammem-hover-btn" data-action="toRead">
        <span>📖</span> To Read
      </button>
      <button class="motammem-hover-btn" data-action="read">
        <span>✓</span> Read
      </button>
    `;
    
    document.body.appendChild(tooltip);
    hoverTooltip = tooltip;
    
    // Position tooltip near the link
    const rect = link.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    tooltip.style.top = `${rect.top + window.scrollY - tooltipRect.height - 10}px`;
    tooltip.style.left = `${rect.left + window.scrollX + (rect.width / 2) - (tooltipRect.width / 2)}px`;
    
    // Add click handlers
    tooltip.querySelectorAll('.motammem-hover-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.action;
        const url = link.href;
        const title = link.textContent.trim() || link.href;
        
        try {
          const msgAction = action === 'toRead' ? 'addToRead' : 'addToReadList';
          const response = await chrome.runtime.sendMessage({
            action: msgAction,
            url,
            title
          });
          
          if (response.success) {
            showNotification(`Added to ${action === 'toRead' ? 'To Read' : 'Read'} list`);
          } else {
            showNotification(response.error || 'Failed to add', true);
          }
        } catch (error) {
          showNotification('Error: ' + error.message, true);
        }
        
        hideHoverTooltip();
      });
    });
    
    // Show tooltip
    setTimeout(() => {
      tooltip.classList.add('show');
    }, 10);
  }
  
  function hideHoverTooltip() {
    if (hoverTooltip) {
      hoverTooltip.classList.remove('show');
      setTimeout(() => {
        if (hoverTooltip) {
          hoverTooltip.remove();
          hoverTooltip = null;
        }
      }, 200);
    }
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
  }
  
  // Add hover listeners to links
  function setupLinkHover() {
    document.addEventListener('mouseover', (e) => {
      const link = e.target.closest('a');
      if (!link || !link.href) return;

      // Only offer the quick-add tooltip on links that look like posts.
      if (isPostUrl(link)) {
        hoverTimeout = setTimeout(() => {
          createHoverTooltip(link);
        }, 500); // Show after 500ms hover
      }
    });
    
    document.addEventListener('mouseout', (e) => {
      const link = e.target.closest('a');
      if (link && hoverTooltip) {
        // Check if mouse is leaving the link area
        const relatedTarget = e.relatedTarget;
        if (!relatedTarget || (!link.contains(relatedTarget) && !hoverTooltip.contains(relatedTarget))) {
          hoverTimeout = setTimeout(() => {
            hideHoverTooltip();
          }, 200);
        }
      }
    });
    
    // Keep tooltip visible when hovering over it
    document.addEventListener('mouseover', (e) => {
      if (hoverTooltip && hoverTooltip.contains(e.target)) {
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
          hoverTimeout = null;
        }
      }
    });
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      createFloatingButtons();
      setupLinkHover();
    });
  } else {
    createFloatingButtons();
    setupLinkHover();
  }
  
  // Re-check status when page becomes visible
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkPostStatus();
    }
  });
})();

