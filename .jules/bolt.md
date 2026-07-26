## 2024-05-24 - Throttling Scroll Event Listeners
**Learning:** High-frequency UI events like 'scroll' that involve synchronous DOM layout measurements (`scrollHeight`, `innerHeight`, `scrollY`) can block the main thread and cause layout thrashing in this application. The existing unthrottled scroll listeners severely degrade scrolling performance when reading long chats.
**Action:** Always throttle scroll listeners using `window.requestAnimationFrame()` along with a `ticking` boolean flag to decouple scroll event dispatching from DOM updates/measurements.
