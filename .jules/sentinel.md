## 2024-05-15 - [XSS via Attribute Injection]
**Vulnerability:** The custom `escapeHtml` function relied on assigning to `div.textContent` and reading `div.innerHTML`. While this escapes `<`, `>`, and `&`, it does not escape quotes (`"` or `'`).
**Learning:** This approach leaves the application vulnerable to XSS through attribute injection when the output of `escapeHtml` is placed directly inside HTML attributes (such as `alt` or `href` generated from markdown links and images).
**Prevention:** Always use regex-based string replacements (or a proven library) that explicitly cover `&`, `<`, `>`, `"`, and `'` when escaping arbitrary strings for rendering in HTML, especially if they might end up in attributes.
