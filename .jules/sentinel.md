## 2024-05-24 - Hardcoded Secret Removal
**Vulnerability:** Hardcoded NVIDIA API key was present in `backend/test_api.js`.
**Learning:** Hardcoding credentials in source code exposes them to anyone with access to the repository, leading to potential unauthorized access and billing charges.
**Prevention:** Always use environment variables (e.g., `process.env.NVIDIA_API_KEY`) and load them securely from a `.env` file or environment configuration. Avoid committing secrets into version control.
