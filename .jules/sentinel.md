## 2024-05-18 - [Fix Attribute Injection XSS in escapeHtml]
**Vulnerability:** The `escapeHtml` function relied on `div.textContent = text; return div.innerHTML;` which fails to escape single and double quotes. This allows for attribute injection XSS if the output is inserted into an HTML attribute context.
**Learning:** DOM-based text escaping (`textContent` -> `innerHTML`) is context-unaware and insufficient for preventing all types of XSS, especially attribute injection where quotes must be escaped.
**Prevention:** Strictly use comprehensive regex-based string replacements for `<`, `>`, `&`, `'`, and `"` to ensure all HTML contexts are safe.
