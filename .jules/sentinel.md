## 2024-05-18 - [XSS] Regex vs DOM escaping for HTML entities
**Vulnerability:** XSS Attribute Injection in `escapeHtml`
**Learning:** The DOM-based method of HTML escaping (creating a div, setting `textContent`, and reading `innerHTML`) only escapes `<`, `>`, and `&`, but fails to escape single `\'` and double `\"` quotes. This exposes the application to attribute injection if the escaped text is placed inside HTML attributes.
**Prevention:** Use standard regex-based string replacements covering all five core entities: `&`, `<`, `>`, `"`, and `'`. Always prioritize `&` replacement first to avoid double-escaping later encoded entities.
