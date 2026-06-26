# Corpus Validation

RuleMeter is still a lab tool. Use corpus validation to collect evidence before public package publication or absorption into another CLI.

The validation harness reads a local manifest of real instruction files, runs RuleMeter, and emits review metrics. It does not commit corpus contents. By default it reports fingerprints, locations, recommendations, and risk labels without including raw rule text.

## Run

```bash
npm run validate:corpus
node scripts/validate-corpus.mjs --manifest validation/corpus.example.json --format markdown
node scripts/validate-corpus.mjs --manifest /path/to/private-corpus.json --format json --out validation-result.json
node scripts/validate-corpus.mjs --manifest /path/to/private-corpus.json --format markdown --strict
```

Use `--include-text` only for local review artifacts that will not be published.

Use `--strict` when the manifest should fail CI if validation warnings remain. Strict mode exits non-zero for warnings such as too few documents, too few roots, missing holdout files, or unlabeled findings.

## CI Smoke Vs Release Evidence

`npm run validate:corpus` intentionally uses `validation/corpus.example.json` without `--strict`. It belongs in CI as a smoke test so the validation harness does not rot.

Standalone release evidence must come from a private manifest of owned real instruction files run with `--strict`. Do not use the example corpus as a product-readiness signal.

## Manifest

```json
{
  "schemaVersion": "rulemeter.validation.v1",
  "documents": [
    {
      "id": "repo-a/AGENTS.md",
      "path": "/absolute/path/to/repo-a/AGENTS.md",
      "root": "repo-a",
      "split": "calibration"
    },
    {
      "id": "repo-b/CLAUDE.md",
      "path": "/absolute/path/to/repo-b/CLAUDE.md",
      "root": "repo-b",
      "split": "holdout"
    }
  ],
  "labels": {}
}
```

Paths may be absolute or relative to the manifest file. Keep real corpus manifests outside the repo unless every path and label is safe to publish.

## Labels

After the first run, review findings by fingerprint and add labels:

```json
{
  "labels": {
    "abc123def4567890": {
      "decision": "actionable",
      "note": "Would review the low-risk duplicate for drift or consolidation."
    }
  }
}
```

Allowed decisions are `actionable`, `noise`, `unsafe`, `missed`, and `unreviewed`.

## Evidence Targets

Treat these as validation targets, not product claims:

- at least 20 real instruction documents
- at least 4 distinct roots
- at least one locked holdout split
- duplicate usefulness rate near 80% after manual review
- risk finding usefulness rate near 60% after manual review
- review burden below 20 risk findings per 1,000 instruction lines

If the corpus does not produce actionable review decisions, keep RuleMeter private or absorb it as an internal helper instead of publishing it as a standalone package.

RuleMeter should be positioned as an agent instruction drift and duplicate review aid. Cross-file duplicates are review prompts, not deletion instructions. Do not market RuleMeter as an AI safety/security linter, semantic prompt optimizer, or enforcement engine unless the implementation and corpus evidence change substantially.
