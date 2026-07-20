## 2024-05-18 - Hardcoded API Key in Test Script
**Vulnerability:** A hardcoded NVIDIA API key (`nvapi-...`) was found in `backend/test_api.js`.
**Learning:** Sometimes developers hardcode secrets in test or utility scripts for quick local testing and accidentally commit them. Even if it's a test script, secrets should never be checked into version control.
**Prevention:** Always use environment variables (`dotenv`) or a secure secret manager for API keys, even in test or utility scripts. Use tools like `git-secrets` or GitHub's secret scanning to catch these before they are committed.
