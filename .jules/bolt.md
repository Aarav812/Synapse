## 2024-05-18 - Throttling High-Frequency Scroll Events

**Learning:** Unthrottled event listeners, especially for `scroll`, that include DOM read operations (`window.scrollY`, `innerHeight`, `scrollHeight`) cause expensive layout thrashing and main thread blocking, which degrades frontend scrolling performance.

**Action:** Wrap the logic inside high-frequency event handlers in `window.requestAnimationFrame()` using a `ticking` boolean flag to throttle DOM calculations to a maximum of 60 frames per second.
