## 2024-07-26 - Material Symbols Ligature Accessibility
**Learning:** Material Symbols ligatures use literal text (like "close") to render icons. If an icon-only button lacks `aria-label` and `aria-hidden="true"` on the icon, screen readers will literally read the ligature text (e.g., "close") instead of providing a helpful context.
**Action:** Always ensure icon-only buttons using ligatures have an explicit `aria-label` on the parent `<button>` and `aria-hidden="true"` on the inner `<span>` to guarantee correct screen reader behavior.
