## 2025-02-20 - Unbounded In-Memory Map DoS Risk
**Vulnerability:** The in-memory rate limiter in `backend/server.js` used a `Map` without a size limit.
**Learning:** This codebase uses an in-memory `Map` for rate limiting which can easily grow unbounded when many unique IP addresses or user IDs hit the server, leading to memory exhaustion and a Denial of Service (DoS).
**Prevention:** Always ensure in-memory maps or caches have a bounded maximum size limit and an eviction policy (e.g. deleting the oldest entry before adding a new one) to prevent memory exhaustion DoS.

## 2025-02-20 - DOM-based HTML escaping bypass (XSS)
**Vulnerability:** The `escapeHtml` function in `frontend/js/utils.js` relied on assigning `textContent` and reading `innerHTML`. This successfully escapes `<`, `>`, and `&`, but fails to escape quotes (`'` and `"`), leading to attribute injection XSS when user input is interpolated into HTML attributes.
**Learning:** Using `document.createElement("div").textContent = text; return div.innerHTML` is a common but dangerous anti-pattern for HTML escaping if the output is ever used in HTML attributes, as it leaves single and double quotes unescaped.
**Prevention:** Always use regex-based string replacements (e.g. `text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")`) or dedicated HTML sanitization libraries to thoroughly escape special characters for both tag contents and attributes.
