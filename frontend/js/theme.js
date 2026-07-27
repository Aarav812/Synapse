// ============================================
// Synapse AI — Appearance (Dark / Light)
// The toggle is a physical switch: the knob travels, the room re-lights.
// ============================================

(function () {
  "use strict";

  var STORAGE_KEY = "synapse-theme";
  var root = document.documentElement;

  // Synapse is a dark-first product: the ambient environment and the glass
  // are tuned for midnight. We only go light when the user explicitly asks.
  function preferredTheme() {
    var saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" ? "light" : "dark";
  }

  function apply(theme, animate) {
    var isDark = theme === "dark";

    // Cross-fade the whole environment rather than snapping between palettes.
    if (animate && document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.startViewTransition(function () {
        root.classList.toggle("dark", isDark);
      });
    } else {
      root.classList.toggle("dark", isDark);
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark ? "#060611" : "#eef1fb");

    syncToggle(isDark);
  }

  function syncToggle(isDark) {
    var btn = document.getElementById("theme-toggle-btn");
    if (!btn) return;

    if (btn.classList.contains("theme-toggle")) {
      // New capsule switch — markup stays put, only state changes.
      btn.setAttribute("aria-checked", isDark ? "true" : "false");
      btn.title = isDark ? "Switch to light appearance" : "Switch to dark appearance";
    } else {
      // Legacy icon button (other pages)
      btn.innerHTML =
        '<span class="material-symbols-outlined">' +
        (isDark ? "light_mode" : "dark_mode") +
        "</span>";
      btn.title = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";
    }
  }

  function toggle() {
    var next = root.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    apply(next, true);
  }

  // Paint the correct palette before first frame to avoid a flash.
  apply(preferredTheme(), false);

  function bind() {
    syncToggle(root.classList.contains("dark"));
    var btn = document.getElementById("theme-toggle-btn");
    if (btn && !btn.dataset.themeBound) {
      btn.dataset.themeBound = "1";
      btn.addEventListener("click", toggle);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

})();
