## 2025-01-24 - Accessible Icon-Only Buttons using Material Symbols
**Learning:** When using Material Symbols ligatures for icon-only buttons (e.g., `<span class="material-symbols-outlined">icon_name</span>`), screen readers may read out the ligature text itself ("close", "menu") or struggle to contextually describe the button's action.
**Action:** Always provide an explicit `aria-label` on the parent `<button>` and add `aria-hidden="true"` on the inner `<span>` to ensure proper accessibility for screen readers.
