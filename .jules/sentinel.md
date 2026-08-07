## 2025-02-12 - DOM-Based HTML Escaping Vulnerability
**Vulnerability:** The `escapeHtml` function in `frontend/js/utils.js` used `div.textContent = text; return div.innerHTML;` which fails to escape single and double quotes, leading to potential attribute injection XSS.
**Learning:** Relying on DOM methods like `textContent` for HTML escaping is insufficient when the escaped string might be used within HTML attributes, as quotes remain unescaped.
**Prevention:** Always strictly use regex-based string replacements for `<`, `>`, `&`, `'`, and `"` when escaping HTML to ensure complete safety against XSS, especially attribute injection.
