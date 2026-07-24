## 2025-02-18 - [Debounce Client-Side Filtering]
**Learning:** Filtering DOM-heavy lists (like the chat history sidebar) on every keystroke causes unnecessary jank and re-renders when users type quickly, even if the filtering happens purely in memory.
**Action:** Always add a small debounce (e.g., 300ms) to search inputs that rebuild DOM lists.
