## 2024-05-20 - Search Input Layout Thrashing
**Learning:** Rebuilding a large list of DOM elements inside an `input` event listener causes severe layout thrashing and input lag. Specifically, calling `loadHistoryIndex` directly on every keystroke forces the browser to recalculate layout repeatedly.
**Action:** Always wrap search input handlers that trigger DOM rebuilds with a debounce function (e.g., `setTimeout` for 300ms) to ensure operations run only after the user pauses typing.
