# Release Checklist

RuleMeter is still a lab tool. This checklist keeps npm publication deferred until real private-corpus evidence supports a standalone product claim.

## Always Run Before A Release Candidate

Run these from a clean checkout:

```bash
npm test
npm run dogfood
npm run validate:corpus
npm run pack:check
npm run smoke:install
npm audit --audit-level=high
```

`npm run validate:corpus` is intentionally non-strict and uses `validation/corpus.example.json`. It belongs in CI as a script-rot smoke test only. A green smoke run is not product-readiness evidence.

## Private Strict Corpus Gate

Standalone publication requires a private, owned, real-instruction corpus. Keep the manifest, labels, and any raw-text review artifacts outside this repo unless every path and note is safe to publish.

1. Collect or refresh a private manifest:

```bash
node scripts/collect-corpus.mjs --root /path/to/owned/workspace --out /private/rulemeter-corpus/manifest.json
```

2. Generate a private label template for the current finding fingerprints:

```bash
node scripts/validate-corpus.mjs \
  --manifest /private/rulemeter-corpus/manifest.json \
  --format json \
  --label-template /private/rulemeter-corpus/labels.review.json
```

3. Manually label every emitted finding as `actionable`, `noise`, `unsafe`, or `missed`. Do not leave `unreviewed` findings in release evidence.

4. Run strict validation:

```bash
node scripts/validate-corpus.mjs \
  --manifest /private/rulemeter-corpus/manifest.json \
  --labels /private/rulemeter-corpus/labels.review.json \
  --format markdown \
  --strict
```

The strict run must exit 0 and have no warnings. It must reject stale labels, unreviewed findings, missing holdout documents, missing required signals, and weak usefulness metrics.

## Standalone Release Evidence Targets

Use the default standalone strict policy unless the owner explicitly ratifies a different product decision.

- at least 20 real instruction documents
- at least 4 distinct roots
- at least one locked holdout split
- required signals present: `duplicate`, `surface_overlap`, and `risk_summary`
- same-file duplicate usefulness near 80%
- cross-file surface-overlap usefulness near 60%
- risk-summary usefulness near 60%
- holdout usefulness rates separately meet the same thresholds
- review item load at or below 20 report findings per 1,000 instruction lines
- risk load at or below 20 underlying risk findings per 1,000 instruction lines

If same-file duplicate usefulness cannot be measured because the real corpus has no duplicate signal, standalone publication remains deferred even if internal-helper evidence is positive.

## Internal Helper Decision

For `create-starter` absorption or private helper use, a private manifest may narrow `thresholds.requiredSignals`, for example:

```json
{
  "thresholds": {
    "requiredSignals": ["surface_overlap", "risk_summary"]
  }
}
```

A narrowed strict pass can justify internal-helper use. It is not standalone public-product evidence and must not be used to market RuleMeter as publish-ready.

## Public Surface Check

- Keep `README.md` English-only.
- Keep multilingual messaging on GitHub Pages under `docs/`.
- Keep the landing page verdict aligned with the latest private-corpus evidence.
- Do not claim AI safety/security linting, semantic drift detection, runtime guardrails, red-team coverage, harness scoring, auto-sync PRs, or prompt compression.

## Release Decision

Publish only after the owner ratifies the strict private-corpus evidence and the local release-candidate commands above are green.

If the private corpus misses the standalone targets, do not publish the npm package. Keep RuleMeter private or absorb the useful subset into `create-starter` as an internal instruction-review helper.
