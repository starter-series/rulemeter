# rulemeter Agent Instructions

- Treat this repo as a standalone Starter Series tool root, not as the parent `starter-series` container.
- Do not rewrite source instruction files during audits; `rulemeter` reports only.
- Preserve high-risk rules explicitly when they mention identity, PII, approval, tests, strategy ratification, logs, errors, or security.
- Position RuleMeter as an agent instruction drift and duplicate review aid, not as an AI safety/security linter or enforcement engine.
- Run `npm test`, `npm run dogfood`, `npm run validate:corpus`, `npm run pack:check`, `npm run smoke:install`, and `npm audit --audit-level=high` before claiming release readiness.
- Before npm publication or a standalone public release, run `scripts/validate-corpus.mjs --manifest <private-real-corpus.json> --strict` against owned real instruction files. If the evidence targets in `docs/validation.md` miss, keep RuleMeter private or absorb it into `create-starter audit-agent-rules` instead of publishing it as a standalone package.
