## 2024-07-28 - Material Symbols Accessibility Pattern
**Learning:** When using Material Symbols ligatures (e.g., `<span class="material-symbols-outlined">close</span>`) for icon-only buttons, screen readers will read the raw text ("close") if navigating.
**Action:** Always add `aria-label` to the parent `<button>` and add `aria-hidden="true"` to the inner `<span>` to prevent screen readers from reading the ligature string directly.
