// Content script for injecting UI and handling link hover

(function() {
  'use strict';
  
  // Check if script already injected
  if (window.motamemEnhancerInjected) {
    return;
  }
  window.motamemEnhancerInjected = true;
  
  // Get current page info
  const currentUrl = window.location.href;
  const currentTitle = document.title || '';

  // After the extension is reloaded/updated/disabled, content scripts already
  // running on open tabs are orphaned: chrome.runtime.* still exists but any
  // call throws "Extension context invalidated". Guard messaging on this so we
  // fail quietly instead of spamming the console.
  function isExtensionContextValid() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function isContextInvalidatedError(error) {
    return error && /Extension context invalidated/i.test(error.message || '');
  }

  // MMI18n (shared/i18n.js) resolves language asynchronously here (this page
  // has no localStorage bridge to the extension's origin), so text may need
  // a follow-up update shortly after the buttons first render.
  const t = (key, vars) => (window.MMI18n ? window.MMI18n.t(key, vars) : key);

  const ICON_TOREAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H11v16H4.5A2.5 2.5 0 0 0 2 21.5z"/><path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H13v16h6.5a2.5 2.5 0 0 1 2.5 2.5z"/></svg>';
  const ICON_READ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.2 7 10 18.2 4.8 13"/></svg>';
  const ICON_REMOVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  // Which list this page is currently saved in: null | 'toRead' | 'read'.
  let savedStatus = null;

  // Each button owns a fixed slot ('toRead' or 'read'); what it *does* depends
  // on where the page is currently saved:
  //   saved in this slot   -> 'remove' (take it out of that list)
  //   saved in the other   -> 'move'   (move it over, keeping labels/notes)
  //   not saved at all     -> 'add'
  function roleFor(slot) {
    if (savedStatus === slot) return 'remove';
    return savedStatus ? 'move' : 'add';
  }

  // Create the floating action card
  function createFloatingButtons() {
    // Don't offer to save pages that are on the exclusion list.
    if (typeof isExcludedMotamemUrl === 'function' && isExcludedMotamemUrl(window.location.href)) {
      return;
    }

    // Remove existing buttons if any
    const existing = document.getElementById('motamem-enhancer-buttons');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'motamem-enhancer-buttons';
    container.className = 'motamem-enhancer-container';

    const toReadBtn = document.createElement('button');
    toReadBtn.className = 'motamem-btn motamem-btn-toread';

    const readBtn = document.createElement('button');
    readBtn.className = 'motamem-btn motamem-btn-read';

    container.appendChild(toReadBtn);
    container.appendChild(readBtn);
    document.body.appendChild(container);

    toReadBtn.addEventListener('click', () => handleSlotClick('toRead'));
    readBtn.addEventListener('click', () => handleSlotClick('read'));

    // Paint the not-saved state immediately, then correct it once storage answers.
    renderButtons();
    checkPostStatus();
  }

  // Paint both buttons for the current savedStatus. Safe to call any time —
  // on first render, after an action, and when the language changes.
  function renderButtons() {
    const container = document.getElementById('motamem-enhancer-buttons');
    if (!container) return;
    renderSlot(container.querySelector('.motamem-btn-toread'), 'toRead');
    renderSlot(container.querySelector('.motamem-btn-read'), 'read');
  }

  function renderSlot(btn, slot) {
    if (!btn) return;
    const isRemove = roleFor(slot) === 'remove';
    const isToRead = slot === 'toRead';

    // Label/icon text comes from our own dictionary, never from the page.
    const icon = isRemove ? ICON_REMOVE : (isToRead ? ICON_TOREAD : ICON_READ);
    const label = isRemove ? t('remove') : (isToRead ? t('toRead') : t('read'));
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

  // Check which list (if any) the current post is already saved in
  async function checkPostStatus() {
    if (!isExtensionContextValid()) return;
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getPostStatus',
        url: currentUrl
      });

      if (response && response.success) {
        savedStatus = (response.status === 'toRead' || response.status === 'read') ? response.status : null;
        renderButtons();
      }
    } catch (error) {
      // Orphaned content script after an extension reload: expected, not a bug.
      if (isContextInvalidatedError(error)) return;
      console.error('Error checking post status:', error);
    }
  }

  // Add / move / remove, depending on what the clicked slot currently means.
  // Deliberately silent on success: the button flipping to or from Remove is
  // the feedback. Only real failures raise a notification.
  async function handleSlotClick(slot) {
    if (!isExtensionContextValid()) {
      showNotification(t('extensionReloaded'), true);
      return;
    }

    const role = roleFor(slot);
    try {
      let request;
      if (role === 'remove') {
        request = { action: 'removeFromList', url: currentUrl, listType: slot };
      } else if (role === 'move') {
        // movePost, not addToRead/addToReadList: those two build a fresh post
        // object and would silently drop the post's labels and note.
        request = { action: 'movePost', url: currentUrl, fromList: savedStatus, toList: slot };
      } else {
        request = {
          action: slot === 'toRead' ? 'addToRead' : 'addToReadList',
          url: currentUrl,
          title: extractPostTitle()
        };
      }

      const response = await chrome.runtime.sendMessage(request);

      if (response && response.success) {
        savedStatus = role === 'remove' ? null : slot;
        renderButtons();
      } else {
        showNotification((response && response.error) || failureMessage(role), true);
      }
    } catch (error) {
      if (isContextInvalidatedError(error)) {
        showNotification(t('extensionReloaded'), true);
        return;
      }
      showNotification(t('errorPrefix') + error.message, true);
    }
  }

  function failureMessage(role) {
    if (role === 'remove') return t('failedToRemovePost');
    if (role === 'move') return t('failedToMovePost');
    return t('failedToAddPost');
  }

  // Extract post title from page.
  // Ordered most-specific to least. The old [class*="title"] matcher was
  // dropped because it also matched sidebar/widget/nav elements (e.g.
  // "widget-title") and could win over the real post heading.
  function extractPostTitle() {
    // Canonical title from social metadata, when present.
    const ogTitle = document.querySelector('meta[property="og:title"], meta[name="og:title"]');
    if (ogTitle && ogTitle.content && ogTitle.content.trim()) {
      return ogTitle.content.trim();
    }

    // In-content title elements. motamem.org uses <h1 class="title">; many
    // WordPress themes use .entry-title. Generic h1 is the last DOM fallback.
    const selectors = ['h1.title', '.entry-title', '.post-title', 'article h1', 'main h1', 'h1'];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = element && element.textContent.trim();
      if (text) return text;
    }

    // Fall back to the document title, stripped of a trailing site name
    // (e.g. "Post Title | متمم").
    const docTitle = (document.title || '').split(/\s+[|–—-]\s+/)[0].trim();
    return docTitle || document.title || currentUrl;
  }
  
  // Show notification
  function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = `motamem-notification ${isError ? 'error' : 'success'}`;
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

  // Where a link SITS matters more than what its URL looks like: motamem.org
  // gives articles and ordinary pages the same single-slug URL shape, so the
  // DOM is the only signal that generalises as the site grows.

  // Site chrome — menus, panels, forms. Never articles.
  //
  // Deliberately NOT blocking '.widget' wholesale: the sidebar's lessons index
  // is a widget too (li.widget.widget_black_studio_tinymce > .textwidget) and
  // holds ~47 genuine article links on every page. Blocking the whole widget
  // family threw all of those away. Only the nav-menu widget is excluded, and
  // the slug blocklist in shared/utils.js catches the handful of site pages
  // that do appear in the sidebar (/mpro/, ثبت‌نام کاربر ویژه, …).
  const BLOCKED_LINK_CONTEXT = [
    '.ubermenu',          // main mega-menu
    '.widget_nav_menu',   // footer menu widget — site pages, not articles
    '.sue-panel',         // the about/goal/insights/roadmaps panel
    'nav', 'footer', 'form'
  ].join(',');

  // Containers that genuinely hold article links. '.post' covers the most
  // ground: it wraps both the cards on listing pages (div.post.post-box) and
  // the single-post body (div.post.post-single), so in-article prose links are
  // included. The series box, related-posts block and homepage index box sit
  // outside .post and need naming separately.
  const ARTICLE_LINK_CONTEXT = [
    '.post', 'article', '.hentry',
    '.serieslist-ul',     // "parts of this series" list inside a lesson
    '.related_post',      // related-posts block
    '.box-index',         // curated article index on the homepage
    '.textwidget'         // sidebar lessons index — mostly article links
  ].join(',');

  // A link must be outside all site chrome AND inside a real article container.
  function isSaveableLinkContext(linkEl) {
    // Without closest() we can't judge context; fall back to the URL rules.
    if (typeof linkEl.closest !== 'function') return true;
    if (linkEl.closest(BLOCKED_LINK_CONTEXT)) return false;
    return Boolean(linkEl.closest(ARTICLE_LINK_CONTEXT));
  }

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

    // Judge the link by where it sits in the page, not just its URL.
    if (!isSaveableLinkContext(linkEl)) return false;

    // Explicitly excluded pages (profiles, shop, search, comment pages, …).
    if (typeof isExcludedMotamemUrl === 'function' && isExcludedMotamemUrl(url)) return false;

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
    tooltip.className = 'motamem-hover-tooltip';
    tooltip.innerHTML = `
      <button class="motamem-hover-btn" data-action="toRead">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H11v16H4.5A2.5 2.5 0 0 0 2 21.5z"/><path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H13v16h6.5a2.5 2.5 0 0 1 2.5 2.5z"/></svg>
        <span>${t('toRead')}</span>
      </button>
      <button class="motamem-hover-btn" data-action="read">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.2 7 10 18.2 4.8 13"/></svg>
        <span>${t('read')}</span>
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
    tooltip.querySelectorAll('.motamem-hover-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.action;
        const url = link.href;
        const title = link.textContent.trim() || link.href;

        if (!isExtensionContextValid()) {
          showNotification(t('extensionReloaded'), true);
          hideHoverTooltip();
          return;
        }

        try {
          const msgAction = action === 'toRead' ? 'addToRead' : 'addToReadList';
          const response = await chrome.runtime.sendMessage({
            action: msgAction,
            url,
            title
          });
          
          if (!response.success) {
            showNotification(response.error || t('failedToAdd'), true);
          }
          // Silent on success, matching the floating card. No card update is
          // needed: isPostUrl() rejects links to the page we're already on,
          // so the tooltip never targets the current post.
        } catch (error) {
          showNotification(t('errorPrefix') + error.message, true);
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
  
  // ── Focus reading mode ──────────────────────────────────────────────────
  // motamem.org's own "مطالعه با تمرکز بیشتر" button (div.wpcm-subscribe) has a
  // focus mode we'd rather replace: intercept the click and dim everything
  // outside #content1 to 30% instead.
  const FOCUS_TARGET_ID = 'content1';
  const FOCUS_DIM_CLASS = 'motamem-focus-dim';
  const FOCUS_ACTIVE_CLASS = 'motamem-focus-active';

  function isFocusModeOn() {
    return document.body.classList.contains(FOCUS_ACTIVE_CLASS);
  }

  function focusModeOn() {
    const target = document.getElementById(FOCUS_TARGET_ID);
    if (!target) return;

    // Dim each ancestor's *other* children, walking up from the target and
    // leaving the ancestor chain itself untouched. Opacity composites onto
    // descendants, so fading a shared ancestor would fade #content1 with it —
    // dimming siblings level by level is what keeps the target fully opaque.
    let node = target;
    while (node.parentElement && node.parentElement !== document.documentElement) {
      const parent = node.parentElement;
      for (const sibling of parent.children) {
        if (sibling !== node) sibling.classList.add(FOCUS_DIM_CLASS);
      }
      node = parent;
    }

    document.body.classList.add(FOCUS_ACTIVE_CLASS);
  }

  function focusModeOff() {
    document.querySelectorAll('.' + FOCUS_DIM_CLASS)
      .forEach(el => el.classList.remove(FOCUS_DIM_CLASS));
    document.body.classList.remove(FOCUS_ACTIVE_CLASS);
  }

  function toggleFocusMode() {
    if (isFocusModeOn()) focusModeOff();
    else focusModeOn();
  }

  // Capture phase on document, so this runs before the site's own handler on
  // the link (which is bound further down the tree) and can cancel it outright.
  document.addEventListener('click', (e) => {
    const trigger = e.target && e.target.closest ? e.target.closest('.wpcm-subscribe') : null;
    if (!trigger) return;

    // If the page has no #content1 there's nothing to focus on — leave the
    // site's own behaviour alone rather than swallowing the click.
    if (!document.getElementById(FOCUS_TARGET_ID)) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    toggleFocusMode();
  }, true);

  // Escape leaves focus mode, so it can't become a state the user is stuck in.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFocusModeOn()) focusModeOff();
  });

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

  // MMI18n resolves the real language from chrome.storage asynchronously
  // (this page has no localStorage bridge to the extension's origin), and
  // it can also change live if the user flips the toggle in the popup or
  // saved-posts tab while this page is open. Re-render the floating
  // buttons' text either way; the tooltip is ephemeral so it just picks up
  // the current language next time it's created.
  window.addEventListener('mm-i18n-ready', () => {
    renderButtons();
  });
  
  // Re-check status when page becomes visible. If the extension has since been
  // reloaded, this script is orphaned — stop listening so we don't keep firing
  // doomed messages every time the tab regains focus.
  function onVisibilityChange() {
    if (document.hidden) return;
    if (!isExtensionContextValid()) {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      return;
    }
    checkPostStatus();
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  // Keep the card in step with saves made anywhere else: the popup, the
  // saved-posts page, an import, or another open motamem tab. visibilitychange
  // can't cover the popup case — opening the popup never hides the tab, so the
  // card would otherwise sit stale until you switched tabs and came back.
  //
  // Key names mirror STORAGE_KEYS in shared/storage.js, which the content
  // script doesn't load. A single write that touches both lists (adding to one
  // removes from the other) arrives as one event, so this re-checks once.
  const WATCHED_STORAGE_KEYS = ['toRead', 'read'];
  try {
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!WATCHED_STORAGE_KEYS.some(key => key in changes)) return;
        checkPostStatus();
      });
    }
  } catch {
    // Orphaned content script after an extension reload — nothing to sync to.
  }
})();

