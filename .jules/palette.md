## 2026-07-22 - Accessible Icon-Only Buttons
**Learning:** Found a common pattern in this app's components where icon-only buttons using Material Symbols ligatures lack both `aria-label` on the parent `<button>` and `aria-hidden="true"` on the inner `<span>`. This makes them completely invisible/unusable to screen reader users.
**Action:** Always verify that icon-only buttons with ligatures have explicit `aria-label` descriptions and explicitly hide the ligature span from screen readers using `aria-hidden="true"`.
