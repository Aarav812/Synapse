## 2024-05-24 - Accessibility on Modal Close Buttons
**Learning:** Found a pattern where icon-only modal close buttons in `chat.html` (e.g., `#close-history-btn`, `#close-settings-btn`) were using `material-symbols-outlined` without `aria-label`s on the `<button>` and `aria-hidden="true"` on the inner `<span>`. This makes them inaccessible to screen readers.
**Action:** Added `aria-label` to the buttons and `aria-hidden="true"` to the icon spans. In the future, check all new icon-only buttons for these attributes to ensure a11y compliance.
