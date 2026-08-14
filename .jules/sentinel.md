## 2024-05-27 - [Fix DoS risk in global express middleware]
**Vulnerability:** Global express middleware accepted 10mb JSON payload limit across all endpoints.
**Learning:** Found that Express payload limits should be scoped to specific routes requiring large payloads to mitigate general Denial of Service (DoS) risks.
**Prevention:** Apply permissive limits explicitly to endpoints like `/api/chat` that require image payloads, and maintain a stricter fallback (e.g., `100kb`) globally.
