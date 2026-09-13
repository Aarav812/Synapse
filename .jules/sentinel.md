## 2024-05-18 - Math.random() usage for sensitive identifiers
**Vulnerability:** The codebase was using `Math.random()` to generate unique identifiers (e.g., `generateId()`). `Math.random()` is not cryptographically secure, and its outputs can be predicted by an attacker, leading to ID collisions or predictability vulnerabilities.
**Learning:** This existed because `Math.random()` is convenient and built into older JavaScript environments, often used without considering the security implications in modern applications.
**Prevention:** Always use `window.crypto.randomUUID()` when available, or `window.crypto.getRandomValues()` as a secure fallback, for generating identifiers, tokens, or any random values where unpredictability is required.
## 2024-05-18 - XSS in dynamic chip rendering
**Vulnerability:** The codebase failed to escape `chip.icon`, `chip.title`, and `chip.description` when interpolating them into HTML within `btn.innerHTML = ...` in `frontend/js/chat_partial.js`. This allowed malicious payload execution via XSS if those chips were generated from user input or external APIs.
**Learning:** This existed because properties like `title` or `icon` might appear inherently safe, but when inserted directly into `innerHTML` using template literals, any payload (e.g. `<img src=x onerror=...`) will be executed by the browser.
**Prevention:** Always wrap dynamically interpolated values in an escaping function (like `escapeHtml()`) when constructing HTML strings for `innerHTML`, even for supposedly "safe" fields like titles or descriptions.
