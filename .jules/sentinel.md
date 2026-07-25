## 2025-02-14 - [CRITICAL] Fixed Hardcoded Secret in Test Script
**Vulnerability:** A hardcoded API key was exposed in `backend/test_api.js`.
**Learning:** Hardcoded credentials shouldn't be left in test files, as these might accidentally get committed. Test scripts often bypass rigorous review, leading to leaked secrets.
**Prevention:** Use environment variables (via `dotenv`) for all credentials even in small test/development scripts. Always `.gitignore` `.env` files.
