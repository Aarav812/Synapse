## 2024-07-29 - [CRITICAL] Remove Hardcoded NVIDIA API Key
**Vulnerability:** A hardcoded production NVIDIA API key (`nvapi-...`) was discovered in `backend/test_api.js`, which could lead to unauthorized access and potential financial or quota-related impact if the repository is public or inadvertently leaked.
**Learning:** Test scripts in the repository might contain hardcoded secrets due to temporary local testing setups that were unintentionally committed.
**Prevention:** Always use environment variables (e.g., `process.env.NVIDIA_API_KEY`) even in test scripts. Utilize fallback values (e.g., `"stub-api-key"`) for unauthenticated local execution instead of committing actual secrets.
