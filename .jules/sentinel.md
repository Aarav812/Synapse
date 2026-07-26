## 2024-05-18 - DOM-based HTML Escaping XSS
**Vulnerability:** XSS vulnerability in `escapeHtml` due to DOM `textContent` escaping which doesn't escape quotes.
**Learning:** Assigning to `textContent` and reading `innerHTML` escapes `<`, `>`, and `&`, but not `"` or `'`. When this escaped text is used within HTML attributes, an attacker can break out using quotes.
**Prevention:** Always use regex-based escaping or established libraries for HTML escaping that cover all 5 unsafe characters (`&`, `<`, `>`, `"`, `'`).
