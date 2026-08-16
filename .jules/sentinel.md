## 2024-05-18 - Fix XSS vulnerability in HTML escaping
**Vulnerability:** The `escapeHtml` utility function relied on DOM manipulation (`div.textContent`), which failed to escape quotes (`'` and `"`), exposing the app to attribute injection XSS.
**Learning:** In the frontend, using DOM-based escaping is insufficient to prevent XSS.
**Prevention:** Strictly use regex-based string replacements for `<`, `>`, `&`, `'`, and `"` to prevent XSS.
