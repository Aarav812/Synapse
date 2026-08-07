## 2024-05-18 - [Dynamic ARIA labels for toggle buttons]
**Learning:** Toggle buttons with icons (like show/hide password) need their `aria-label` updated via JavaScript to match their visual state so screen readers are synced.
**Action:** Always update the `aria-label` property in the click handler for toggle buttons.

## 2024-05-18 - [ARIA label and hidden spans for icon-only buttons]
**Learning:** Icon-only buttons using Material Symbols require an explicit `aria-label` on the parent `<button>` and `aria-hidden="true"` on the inner `<span>` to ensure proper accessibility for screen readers.
**Action:** Always follow this pattern for icon-only buttons.
