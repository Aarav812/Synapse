## 2024-08-12 - [XSS] Unsafe HTML Escaping Implementation
**Vulnerability:** The `escapeHtml` function relied on `div.textContent` and `div.innerHTML` to escape HTML special characters. While this escapes `<`, `>`, and `&`, it crucially fails to escape quotes (`"` and `'`), leaving the application vulnerable to attribute injection XSS.
**Learning:** DOM-based escaping via `textContent` is insufficient for comprehensive XSS protection because browsers do not HTML-encode quotes in `textContent` by default, which is dangerous when the output is placed inside HTML attributes.
**Prevention:** Always use regex-based replacements (or a proven library) to encode all five core HTML characters (`<`, `>`, `&`, `"`, `'`) explicitly when rolling your own sanitization logic.
