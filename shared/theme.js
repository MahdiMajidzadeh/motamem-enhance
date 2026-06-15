// Theme helper, shared by the popup and the saved-posts page.
//
// Loaded as the first script in <head> so it can set the theme on
// <html> synchronously, before the stylesheet paints — this avoids a
// flash of the wrong theme. (MV3 forbids inline scripts, so this must be
// an external file rather than an inline <script>.)
//
// Stored value 'light' | 'dark' forces that theme; 'system' (or unset)
// follows the OS via the CSS prefers-color-scheme media query.
(function () {
  var KEY = 'mm-theme';

  function apply(theme) {
    var root = document.documentElement;
    if (theme === 'light' || theme === 'dark') {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }
  }

  // Apply as early as possible (this runs during <head> parsing).
  try { apply(localStorage.getItem(KEY)); } catch (e) {}

  window.MMTheme = {
    KEY: KEY,
    apply: apply,
    get: function () {
      try { return localStorage.getItem(KEY) || 'system'; } catch (e) { return 'system'; }
    },
    set: function (theme) {
      try { localStorage.setItem(KEY, theme); } catch (e) {}
      apply(theme);
    }
  };
})();
