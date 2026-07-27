## 2024-03-24 - Throttling High-Frequency Scroll Events

**Learning:** When attaching high-frequency event listeners (like `scroll` or `resize`) that read DOM layout properties such as `scrollHeight`, `innerHeight`, or `scrollY`, it causes synchronous reflow/layout in the browser. Doing this unthrottled blocks the main thread and causes layout thrashing, which leads to janky scrolling and poor user experience, particularly on lower-end devices or heavily nested pages.

**Action:** Always wrap event handlers for `scroll` and `resize` in a `window.requestAnimationFrame()` callback. Use a state boolean (like `ticking`) to ensure only one animation frame request is pending at any given time, preventing the callback queue from flooding.