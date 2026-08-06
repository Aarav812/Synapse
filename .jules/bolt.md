## 2024-03-14 - [Throttling Scroll Events]
**Learning:** High-frequency UI events (like 'scroll' or 'resize' listeners) that involve DOM measurements (e.g., `scrollHeight`, `innerHeight`) can cause significant main thread blocking and layout thrashing if not throttled.
**Action:** Always wrap the logic inside high-frequency event listeners with `window.requestAnimationFrame()` or use a throttling utility to optimize performance and prevent layout thrashing.
