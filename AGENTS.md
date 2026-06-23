# rulemeter Agent Instructions

- Treat this repo as a standalone Starter Series tool root, not as the parent `starter-series` container.
- Do not rewrite source instruction files during audits; `rulemeter` reports only.
- Preserve high-risk rules explicitly when they mention identity, PII, approval, tests, strategy ratification, logs, errors, or security.
- Run `npm test`, `npm run dogfood`, `npm run pack:check`, and `npm audit --audit-level=high` before claiming release readiness.
