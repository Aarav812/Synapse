## 2026-07-23 - DOM Reflow Optimization
**Learning:** Frequent DOM appending in loops (like appending history items) causes O(N) reflows and layout thrashing, which can cause significant stuttering during filtering.
**Action:** Used `DocumentFragment` for batched DOM insertion alongside a debounced event listener to avoid premature parsing and rendering. Always check loop bounds when appending DOM nodes.
