## 2024-03-24 - [Fix Hardcoded API Key in Test Script]
**Vulnerability:** A hardcoded NVIDIA API key was found in `backend/test_api.js`.
**Learning:** Hardcoded credentials even in test files can leak into source control and be misused, creating a critical security risk.
**Prevention:** Always use environment variables (`dotenv`) and secret management tools instead of hardcoding sensitive keys in code, including test and scripts directories.