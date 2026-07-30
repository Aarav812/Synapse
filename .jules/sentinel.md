## 2024-05-24 - [Fix Hardcoded Secret]
**Vulnerability:** Found a hardcoded NVIDIA API key in `backend/test_api.js`.
**Learning:** Test scripts often have hardcoded credentials for local convenience, which can easily be accidentally committed, exposing sensitive keys. The use of dotenv is avoided in this specific script because of Netlify CI deployment constraints.
**Prevention:** Use environment variables (like `process.env.NVIDIA_API_KEY`) with fallback dummy values (`stub-api-key-for-testing`) to maintain local testability without exposing actual secrets. Always check test scripts for credentials.
