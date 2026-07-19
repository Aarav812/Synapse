## $(date +%Y-%m-%d) - DOM Thrashing in Scroll Handlers
**Learning:** Adding requestAnimationFrame and state caching significantly reduces DOM layout thrashing. Setting inline styles directly on every scroll event recalculates layouts unnecessarily. Caching the state ensures styles are only updated when a transition (visible -> hidden or hidden -> visible) happens.
**Action:** Always throttle high-frequency events like scroll or resize, and cache layout variables when mutating DOM conditionally on these events.
