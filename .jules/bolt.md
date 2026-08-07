## 2023-08-07 - Throttling Scroll Listeners
**Learning:** High-frequency DOM reads (like `scrollHeight`, `innerHeight`) and writes inside unthrottled `scroll` event listeners block the main thread and cause layout thrashing, specifically in components like `chat.js` for the scroll-to-bottom button and header shadows.
**Action:** Always throttle such scroll events using `window.requestAnimationFrame()` to sync layout changes with the display refresh rate.
