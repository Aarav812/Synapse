## 2024-05-18 - [CRITICAL] Remove Hardcoded NVIDIA API Key
**Vulnerability:** A hardcoded API key (`nvapi-...`) was found directly in `backend/test_api.js`.
**Learning:** Hardcoding secrets even in test scripts can lead to accidental commits and leaks, compromising the associated account and services.
**Prevention:** Always use environment variables (`process.env.NVIDIA_API_KEY`) and manage secrets using tools like `dotenv` rather than committing them in the repository.