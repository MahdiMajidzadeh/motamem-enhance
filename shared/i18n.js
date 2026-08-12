// i18n helper, shared by the popup, the saved-posts page, and the content
// script. Mirrors shared/theme.js's pattern (persist + apply as early as
// possible), but has to account for one extra wrinkle: the popup and
// saved-posts pages share the extension's own origin (chrome-extension://…)
// so localStorage is a fast, synchronous, shared cache between them — but
// the content script runs on the *website's* origin, where localStorage
// would be the site's own storage, not ours. So:
//   - Extension pages (popup, saved-posts): localStorage cache for an
//     instant first paint, resynced from chrome.storage.local (source of
//     truth) a tick later.
//   - Content script: chrome.storage.local only. Never touches localStorage
//     (that's the host page's storage, not ours) and never mutates the host
//     page's <html lang/dir> — only our own injected elements get translated.
(function () {
  'use strict';

  var KEY = 'mm-lang';
  var STORAGE_KEY = 'mmLang';
  var DEFAULT_LANG = 'fa';
  var isExtensionPage = (typeof location !== 'undefined' && location.protocol === 'chrome-extension:');

  var FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  function toFaDigits(value) {
    return String(value).replace(/[0-9]/g, function (d) { return FA_DIGITS[d]; });
  }

  var DICT = {
    en: {
      appTitle: 'Motamem Enhancer',
      brandName: 'Enhanced Motamem',
      brandSub: 'Motamem Enhancer',
      savedPostsTitle: 'Saved Posts · Motamem Enhancer',
      savedPostsHeading: 'Saved Posts',
      themeAria: 'Theme',
      themeSystem: 'System',
      themeLight: 'Light',
      themeDark: 'Dark',
      themeTitle: '{label} — click to change',
      langAria: 'Language',
      langTitle: '{label} — click to switch',
      checkingPage: 'Checking current page…',
      toRead: 'To Read',
      read: 'Read',
      addToToReadTitle: 'Add to To Read list',
      addToReadTitle: 'Add to Read list',
      extensionReloaded: 'Extension was reloaded — please refresh the page',
      failedToAdd: 'Failed to add',
      stats: 'Stats',
      viewSavedPosts: 'View saved posts',
      export: 'Export',
      import: 'Import',
      notOnBlog: 'Not on Motamem blog',
      pageCannotBeSaved: "This page can't be saved",
      invalidUrl: 'Invalid URL',
      alreadyInToRead: 'Already in To Read list',
      alreadyInRead: 'Already in Read list',
      notSavedYet: 'Not saved yet',
      errorCheckingStatus: 'Error checking status',
      addedToList: 'Added to {list} list',
      failedToAddPost: 'Failed to add post',
      exportSuccessful: 'Export successful',
      exportFailed: 'Export failed',
      importedPosts: 'Imported {imported} posts, skipped {skipped} duplicates',
      importFailed: 'Import failed',
      errorPrefix: 'Error: ',
      searchPlaceholder: 'Search posts…',
      searchClearAria: 'Clear search',
      loadingPosts: 'Loading posts…',
      noPostsYetTitle: 'No posts saved yet',
      noPostsYetDesc: "Start saving posts from the blog and they'll appear here.",
      noResultsTitle: 'No results found',
      noResultsDesc: 'No posts match your search.',
      statsPrev: '← Prev',
      statsNext: 'Next →',
      statsLegendRead: 'Read',
      statsLegendUnread: 'To Read',
      statsEmpty: 'No posts saved this month.',
      statTotalSaved: 'Total saved',
      statRead: 'Read',
      statUnread: 'To Read',
      statsTrendTitle: 'Last {n} months trend',
      statsBreakdownTitle: 'Breakdown by topic',
      labelFilterAll: 'All',
      deleteLabelAria: 'Delete label {name}',
      deleteLabelConfirm: 'Delete the label "{name}"? It will be removed from every saved post.',
      labelDeleted: 'Label "{name}" deleted',
      failedToDeleteLabel: 'Failed to delete label',
      failedToUpdateLabels: 'Failed to update labels',
      removeLabelAria: 'Remove label {name}',
      labelPopoverTitle: 'Labels',
      noLabelsHint: 'No labels yet — create one below.',
      newLabelPlaceholder: 'New label…',
      add: 'Add',
      noteAdd: '📝 Add note',
      noteEdit: 'Edit',
      notePlaceholder: 'Write a note about this post…',
      save: 'Save',
      cancel: 'Cancel',
      failedToSaveNote: 'Failed to save note',
      markAsRead: 'Mark as Read',
      moveToToRead: 'Move to To Read',
      labelBtn: '🏷️ Label',
      remove: 'Remove',
      paginationPrev: '← Previous',
      paginationNext: 'Next →',
      paginationInfo: '{start}-{end} of {total}',
      removeConfirm: 'Are you sure you want to remove this post?',
      postRemoved: 'Post removed',
      failedToRemovePost: 'Failed to remove post',
      removeFromToReadTitle: 'Remove from To Read list',
      removeFromReadTitle: 'Remove from Read list',
      movedToList: 'Moved to {list} list',
      failedToMovePost: 'Failed to move post',
      failedToLoadPosts: 'Failed to load posts',
      failedToLoadStats: 'Failed to load stats',
      uncategorized: 'Uncategorized'
    },
    fa: {
      appTitle: 'افزونه متمم',
      brandName: 'متمم بهتر',
      brandSub: 'افزونه متمم',
      savedPostsTitle: 'پست‌های ذخیره‌شده · افزونه متمم',
      savedPostsHeading: 'پست‌های ذخیره‌شده',
      themeAria: 'تم',
      themeSystem: 'سیستم',
      themeLight: 'روشن',
      themeDark: 'تیره',
      themeTitle: '{label} — برای تغییر کلیک کنید',
      langAria: 'زبان',
      langTitle: '{label} — برای تغییر کلیک کنید',
      checkingPage: 'در حال بررسی صفحه فعلی…',
      toRead: 'برای خواندن',
      read: 'خوانده‌شده',
      addToToReadTitle: 'افزودن به لیست برای خواندن',
      addToReadTitle: 'افزودن به لیست خوانده‌شده',
      extensionReloaded: 'افزونه به‌روزرسانی شد — لطفاً صفحه را تازه کنید',
      failedToAdd: 'افزودن ناموفق بود',
      stats: 'آمار',
      viewSavedPosts: 'مشاهده پست‌های ذخیره‌شده',
      export: 'خروجی',
      import: 'ورودی',
      notOnBlog: 'در وبلاگ متمم نیستید',
      pageCannotBeSaved: 'این صفحه قابل ذخیره نیست',
      invalidUrl: 'آدرس نامعتبر',
      alreadyInToRead: 'قبلاً در لیست «برای خواندن» است',
      alreadyInRead: 'قبلاً در لیست «خوانده‌شده» است',
      notSavedYet: 'هنوز ذخیره نشده',
      errorCheckingStatus: 'خطا در بررسی وضعیت',
      addedToList: 'به لیست {list} اضافه شد',
      failedToAddPost: 'افزودن پست ناموفق بود',
      exportSuccessful: 'خروجی با موفقیت انجام شد',
      exportFailed: 'خروجی گرفتن ناموفق بود',
      importedPosts: '{imported} پست وارد شد، {skipped} مورد تکراری رد شد',
      importFailed: 'ورود اطلاعات ناموفق بود',
      errorPrefix: 'خطا: ',
      searchPlaceholder: 'جستجو در پست‌ها…',
      searchClearAria: 'پاک کردن جستجو',
      loadingPosts: 'در حال بارگذاری پست‌ها…',
      noPostsYetTitle: 'هنوز پستی ذخیره نشده',
      noPostsYetDesc: 'پست‌ها را از وبلاگ ذخیره کنید تا اینجا نمایش داده شوند.',
      noResultsTitle: 'نتیجه‌ای یافت نشد',
      noResultsDesc: 'برای عبارت جستجوی خود پستی پیدا نشد.',
      statsPrev: '→ ماه قبل',
      statsNext: 'ماه بعد ←',
      statsLegendRead: 'خوانده‌شده',
      statsLegendUnread: 'برای خواندن',
      statsEmpty: 'این ماه پستی ذخیره نشده است.',
      statTotalSaved: 'مجموع ذخیره‌شده',
      statRead: 'خوانده‌شده',
      statUnread: 'برای خواندن',
      statsTrendTitle: 'روند {n} ماه اخیر',
      statsBreakdownTitle: 'پراکندگی براساس موضوع',
      labelFilterAll: 'همه',
      deleteLabelAria: 'حذف برچسب {name}',
      deleteLabelConfirm: 'برچسب «{name}» حذف شود؟ از همه‌ی پست‌های ذخیره‌شده پاک خواهد شد.',
      labelDeleted: 'برچسب «{name}» حذف شد',
      failedToDeleteLabel: 'حذف برچسب ناموفق بود',
      failedToUpdateLabels: 'به‌روزرسانی برچسب‌ها ناموفق بود',
      removeLabelAria: 'حذف برچسب {name}',
      labelPopoverTitle: 'برچسب‌ها',
      noLabelsHint: 'هنوز برچسبی نیست — یکی در پایین بسازید.',
      newLabelPlaceholder: 'برچسب جدید…',
      add: 'افزودن',
      noteAdd: '📝 افزودن یادداشت',
      noteEdit: 'ویرایش',
      notePlaceholder: 'یادداشتی درباره این پست بنویسید…',
      save: 'ذخیره',
      cancel: 'انصراف',
      failedToSaveNote: 'ذخیره یادداشت ناموفق بود',
      markAsRead: 'علامت‌گذاری به‌عنوان خوانده‌شده',
      moveToToRead: 'انتقال به برای خواندن',
      labelBtn: '🏷️ برچسب',
      remove: 'حذف',
      paginationPrev: '← قبلی',
      paginationNext: 'بعدی →',
      paginationInfo: '{start} تا {end} از {total}',
      removeConfirm: 'آیا مطمئن هستید که می‌خواهید این پست را حذف کنید؟',
      postRemoved: 'پست حذف شد',
      failedToRemovePost: 'حذف پست ناموفق بود',
      removeFromToReadTitle: 'حذف از لیست برای خواندن',
      removeFromReadTitle: 'حذف از لیست خوانده‌شده',
      movedToList: 'به لیست {list} منتقل شد',
      failedToMovePost: 'انتقال پست ناموفق بود',
      failedToLoadPosts: 'بارگذاری پست‌ها ناموفق بود',
      failedToLoadStats: 'بارگذاری آمار ناموفق بود',
      uncategorized: 'دسته‌بندی نشده'
    }
  };

  function applyDom(lang) {
    // Never touch the host page's <html> on a content script — only our own
    // extension pages (popup, saved-posts) are ours to direction/lang-tag.
    if (!isExtensionPage) return;
    var root = document.documentElement;
    root.setAttribute('lang', lang);
    root.setAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr');
  }

  var current = DEFAULT_LANG;
  if (isExtensionPage) {
    try { current = localStorage.getItem(KEY) || DEFAULT_LANG; } catch (e) {}
  }
  applyDom(current);

  function notifyReady() {
    try { window.dispatchEvent(new CustomEvent('mm-i18n-ready', { detail: { lang: current } })); } catch (e) {}
  }

  // Resync from chrome.storage.local (source of truth across all surfaces —
  // needed for the content script, and keeps two open extension pages
  // agreeing with each other).
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEY], function (data) {
        var stored = data && data[STORAGE_KEY];
        if (stored && stored !== current) {
          current = stored;
          if (isExtensionPage) { try { localStorage.setItem(KEY, current); } catch (e) {} }
          applyDom(current);
        }
        notifyReady();
      });

      if (chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(function (changes, area) {
          if (area !== 'local' || !changes[STORAGE_KEY]) return;
          var next = changes[STORAGE_KEY].newValue;
          if (!next || next === current) return;
          current = next;
          if (isExtensionPage) { try { localStorage.setItem(KEY, current); } catch (e) {} }
          applyDom(current);
          translatePage();
          notifyReady();
        });
      }
    } else {
      notifyReady();
    }
  } catch (e) {
    notifyReady();
  }

  function get() {
    return current;
  }

  function set(lang) {
    if (lang !== 'fa' && lang !== 'en') return;
    current = lang;
    if (isExtensionPage) { try { localStorage.setItem(KEY, lang); } catch (e) {} }
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ mmLang: lang });
      }
    } catch (e) {}
    applyDom(lang);
    translatePage();
    notifyReady();
  }

  function t(key, vars) {
    var dict = DICT[current] || DICT[DEFAULT_LANG];
    var str = (dict && dict[key] !== undefined) ? dict[key] : ((DICT[DEFAULT_LANG][key] !== undefined) ? DICT[DEFAULT_LANG][key] : key);
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        str = str.split('{' + k + '}').join(vars[k]);
      });
    }
    return str;
  }

  // Format a number (or numeric string) using Persian digits when the
  // active language is Persian; passes English digits through unchanged.
  function n(value) {
    return current === 'fa' ? toFaDigits(value) : String(value);
  }

  // Declarative translation for static markup: data-i18n sets textContent,
  // data-i18n-placeholder sets an input's placeholder, data-i18n-aria sets
  // aria-label, data-i18n-title sets the title attribute. Safe to call in a
  // content-script context too — it only touches elements carrying these
  // attributes, which only our own injected UI has.
  function translatePage() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
  }

  window.MMI18n = {
    KEY: KEY,
    get: get,
    set: set,
    t: t,
    n: n,
    translatePage: translatePage,
    apply: applyDom
  };
})();
