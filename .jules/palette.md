## 2024-05-17 - Added aria-hidden to icon elements
**Learning:** Found that material-symbols-outlined icon elements were missing aria-hidden="true" in index.html, chat.html, and chat.js, which could cause screen readers to announce the ligature text instead of ignoring the decorative icon.
**Action:** Used python script to add aria-hidden="true" to all <span class="material-symbols-outlined"> elements in the main html and js files.
## 2026-09-16 - Dynamic ARIA Feedback on Action Buttons
**Learning:** Action buttons with transient states (like "Copy" temporarily indicating "Copied") or mutually exclusive toggles (like Thumbs Up/Down) need their `aria-label`, `title`, and `aria-pressed` attributes dynamically updated in JavaScript alongside visual changes to ensure screen readers announce the state change properly. If the state is reverted (e.g., via `setTimeout`), the ARIA attributes must also be explicitly reset.
**Action:** When implementing or fixing interactive buttons that change state without a full page reload, always ensure ARIA attributes are programmatically tied to the visual state changes.
