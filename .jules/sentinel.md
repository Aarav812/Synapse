## 2024-05-18 - [Critical] Hardcoded API Key in Test Scripts
**Vulnerability:** Found a hardcoded NVIDIA API key (`nvapi-...`) directly embedded within the `backend/test_api.js` file used for testing purposes.
**Learning:** Test scripts often bypass typical security reviews and can be committed to the repository containing sensitive credentials if not carefully scrutinized.
**Prevention:** Always use environment variables (e.g., via `dotenv`) for configuration and API keys, even in test or debugging scripts. Ensure that secret scanning tools are enabled for the entire repository, including test directories.
