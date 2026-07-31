// ============================================
// Synapse AI — Theme Toggle (Dark / Light)
// ============================================

(function () {
  const STORAGE_KEY = "synapse-theme";

  // ── Initialize Theme ──
  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
    updateIcon();
  }

  // ── Toggle Theme ──
  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
    updateIcon();
  }

  // ── Update Button Icon ──
  function updateIcon() {
    const btn = document.getElementById("theme-toggle-btn");
    if (!btn) return;
    const isDark = document.documentElement.classList.contains("dark");
    btn.innerHTML = `<span class="material-symbols-outlined">${isDark ? "light_mode" : "dark_mode"}</span>`;
    btn.title = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";
  }

  // ── Bind Events ──
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    const btn = document.getElementById("theme-toggle-btn");
    if (btn) {
      btn.addEventListener("click", toggleTheme);
    }
  });

  // Initialize immediately for pages that load inline
  initTheme();
})();
