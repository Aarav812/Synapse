## 2023-10-27 - Keyboard Inaccessible Password Toggle
**Learning:** `tabindex="-1"` on password toggle buttons is a common anti-pattern that hides this functionality from keyboard users. Removing it and dynamically toggling `aria-label` ensures keyboard and screen reader accessibility.
**Action:** Always verify that functional icons/toggles inside forms (like show/hide password) are keyboard-focusable unless explicitly purely decorative.
