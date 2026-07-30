## 2024-05-24 - Throttling Scroll Listeners
**Learning:** High-frequency UI events like scroll listeners in this app can cause layout thrashing and block the main thread if not throttled with `requestAnimationFrame`, especially when they involve DOM measurements like `scrollHeight` and `innerHeight`.
**Action:** Always wrap the logic inside high-frequency event listeners (like scroll, resize, pointermove) with `requestAnimationFrame` (and a ticking flag) to ensure the UI updates smoothly without blocking.
