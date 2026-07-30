
## 2024-05-18 - Interactive Elements and Material Symbols ARIA Requirements
**Learning:** Adding `tabindex="-1"` to interactive elements like toggle buttons breaks keyboard navigation completely. Additionally, when using Material Symbols for icon-only buttons, the inner `<span>` requires `aria-hidden="true"` and the parent `<button>` requires a clear `aria-label`, otherwise screen readers will announce the ligature text (e.g. "visibility") rather than the action ("Toggle password visibility").
**Action:** Never use `tabindex="-1"` on form controls unless intentionally removing them from the tab flow. Always ensure icon-only Material Symbols have `aria-label` on the parent and `aria-hidden="true"` on the child span.
