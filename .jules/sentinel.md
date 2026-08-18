## 2025-02-20 - Unbounded In-Memory Map DoS Risk
**Vulnerability:** The in-memory rate limiter in `backend/server.js` used a `Map` without a size limit.
**Learning:** This codebase uses an in-memory `Map` for rate limiting which can easily grow unbounded when many unique IP addresses or user IDs hit the server, leading to memory exhaustion and a Denial of Service (DoS).
**Prevention:** Always ensure in-memory maps or caches have a bounded maximum size limit and an eviction policy (e.g. deleting the oldest entry before adding a new one) to prevent memory exhaustion DoS.
