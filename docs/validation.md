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

Use `--strict` when the manifest should fail CI if validation warnings remain. Strict mode exits non-zero for warnings such as too few documents, too few roots, missing holdout files, any unlabeled report findings, stale labels, or usefulness targets that cannot be measured from reviewed labels.

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

After the first run, review `findings[]` in the JSON or Markdown report. Each finding has a stable `fingerprint`, `kind`, `split`, `splits`, `decision`, signal fields such as `recommendation` or `risk`, and file locations. By default the harness omits raw text; use locations to open the source file, or pass `--include-text` only for local private review artifacts.

Add labels by fingerprint:

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

Strict release validation expects every emitted report finding to be labeled. A partially labeled manifest still fails because aggregate usefulness can otherwise look healthy while unreviewed holdout findings remain hidden. Stale labels also fail because old fingerprints can make a private review file look more complete than it is. Holdout usefulness is checked separately so calibration labels cannot mask a weak holdout split.

## Evidence Targets

Treat these as validation targets, not product claims:

- at least 20 real instruction documents
- at least 4 distinct roots
- at least one locked holdout split
- duplicate usefulness rate near 80% after manual review
- surface-overlap usefulness rate near 60% after manual review
- risk-summary usefulness rate near 60% after manual review
- holdout usefulness rates should also meet those thresholds
- review item load below 20 report findings per 1,000 instruction lines
- review burden below 20 underlying risk findings per 1,000 instruction lines

If the corpus does not produce actionable review decisions, keep RuleMeter private or absorb it as an internal helper instead of publishing it as a standalone package.

RuleMeter should be positioned as an agent instruction drift and duplicate review aid. Same-file duplicates are deletion candidates; cross-file surface overlaps are review prompts, not deletion instructions. Do not market RuleMeter as an AI safety/security linter, semantic prompt optimizer, or enforcement engine unless the implementation and corpus evidence change substantially.
