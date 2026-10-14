/* Shared theme, applied before first paint on the app and payment page.
   The design deliberately calls the dark palette "day" and the light one "night".
   Older dark/light preferences are still understood; no system preference overrides it. */
(function () {
  'use strict';
  var KEY = 'bbq_theme';
  var root = document.documentElement;

  function normalize(value) {
    if (value === 'day' || value === 'dark') return 'day';
    if (value === 'night' || value === 'light') return 'night';
    return null;
  }

  function saved() {
    try { return normalize(localStorage.getItem(KEY)) || 'day'; }
    catch (e) { return 'day'; }
  }

  function get() {
    return normalize(root.getAttribute('data-theme')) || saved();
  }

  function set(value, options) {
    var theme = normalize(value) || 'day';
    root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'night' ? '#FDF9F3' : '#0D0A08');
    if (!options || options.persist !== false) {
      try { localStorage.setItem(KEY, theme); } catch (e) { /* Private browsing is supported. */ }
    }
    window.dispatchEvent(new CustomEvent('bbq:theme', { detail: { theme: theme } }));
    return theme;
  }

  window.BBQTheme = {
    get: get,
    set: set,
    toggle: function () { return set(get() === 'day' ? 'night' : 'day'); },
  };
  window.addEventListener('storage', function (event) {
    if (event.key === KEY || event.key === null) set(saved(), { persist: false });
  });
  set(saved(), { persist: false });
})();
