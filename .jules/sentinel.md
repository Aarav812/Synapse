## 2025-02-04 - Fixed DOM-based XSS escaping
**Vulnerability:** `escapeHtml` used `div.textContent` and returned `div.innerHTML`. This fails to escape quotation marks (`"` and `'`), making it vulnerable to attribute injection XSS.
**Learning:** Browser native DOM element parsing intentionally doesn't escape quotes because it assumes the text will be placed *inside* an element, not an attribute.
**Prevention:** Always use regex or dedicated libraries for HTML escaping when dealing with untrusted user input, especially if the string might be used within HTML attributes.
