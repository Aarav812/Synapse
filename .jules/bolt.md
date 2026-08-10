## 2023-10-27 - [Throttling Scroll Listeners]
**Learning:** Found unthrottled scroll event listeners that synchronously read layout properties (`document.documentElement.scrollHeight`, `window.innerHeight`) inside `frontend/js/chat.js`. Doing layout reads during unthrottled scroll events causes severe layout thrashing and blocks the main thread.
**Action:** Applied `window.requestAnimationFrame()` to throttle DOM measurements and class manipulations inside high-frequency event listeners like `scroll`.
