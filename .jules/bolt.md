## 2025-02-27 - Throttle DOM Reads/Writes in Scroll Listeners
**Learning:** Attaching expensive layout-measuring operations (like `document.documentElement.scrollHeight` or `window.innerHeight`) directly to the `scroll` event causes layout thrashing and main-thread blocking, significantly degrading UI performance.
**Action:** Always throttle continuous events (such as `scroll` or `resize`) using `window.requestAnimationFrame()` combined with a `ticking` flag to restrict calculations and DOM writes to once per display frame.
