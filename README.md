# RuleMeter

> Status: Lab — standalone validation before possible `create-starter audit-agent-rules` absorption.

`RuleMeter` is a report-only review aid for agent instruction drift and duplicate text in files such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and Copilot instruction files.

Website: https://starter-series.github.io/rulemeter/

It helps maintainers review:

- same-file duplicated instruction text
- cross-file surface overlaps that may indicate drift or intentional parity
- keyword-based review prompts that may deserve human attention
- optional lexical near-duplicate drift candidates

It does not rewrite files, compress prompts, guarantee safety coverage, prove that an instruction set is secure, or replace a human review. Treat the report as a review aid, not an AI safety/security linter or enforcement engine.

## Install

From a clone:

```bash
npm install
npm run build
node dist/cli.js audit AGENTS.md CLAUDE.md task.txt
```

After package installation, use the `rulemeter` binary:

```bash
rulemeter audit AGENTS.md CLAUDE.md task.txt
```

## Usage

```bash
rulemeter audit AGENTS.md CLAUDE.md task.txt
rulemeter audit --preset all
rulemeter audit --preset claude --list-files
rulemeter audit --preset all --format markdown
rulemeter audit --preset all --fail-on duplicate
rulemeter audit --preset all --fail-on risk
rulemeter audit --preset all --experimental-similar --format markdown
rulemeter audit AGENTS.md --json
rulemeter audit AGENTS.md --config rulemeter.config.json
```

From source:

```bash
node dist/cli.js audit AGENTS.md CLAUDE.md task.txt
npm run dogfood
```

## JSON Contract

Machine-readable output includes a stable `schemaVersion`:

- `rulemeter.audit.v2` for `audit --json`
- `rulemeter.discovery.v1` for `audit --list-files --json`
- `rulemeter.error.v1` for JSON errors

`rulemeter.audit.v2` intentionally removes the earlier draft token/alias fields and `count` command surface. Treat new keys as additive within v2.

`riskFindings` lists keyword-based risk matches independently from duplicate candidates, so `--fail-on risk` can catch single-stated rules. This is still best-effort and non-exhaustive.

`surfaceOverlaps` summarizes exact cross-file overlaps by the set of files that share text. These are review prompts for drift, parity, or consolidation, not deletion instructions.

Errors use `rulemeter.error.v1` and stable `error.code` values for automation. Common user-facing codes include `NO_FILES_FOUND`, `FILE_NOT_FOUND`, `NOT_A_FILE`, `CONFIG_NOT_FOUND`, `CONFIG_INVALID_JSON`, `CONFIG_INVALID`, `INVALID_OPTION`, `UNKNOWN_FLAG`, and `UNKNOWN_COMMAND`.

## Reports And CI Tripwires

Use Markdown output for PR comments or CI summaries:

```bash
rulemeter audit --preset all --format markdown
```

Use `--fail-on` to make CI fail after printing the normal report:

```bash
rulemeter audit --preset all --fail-on duplicate
rulemeter audit --preset all --fail-on risk
rulemeter audit --preset all --experimental-similar --fail-on similar
```

| Gate | Fails when |
|---|---|
| `duplicate` | At least one same-file exact duplicate candidate recommends `remove_duplicate`. Cross-file `surfaceOverlaps` are report-only. |
| `risk` | At least one best-effort risk finding was found. |
| `similar` | At least one experimental similar-rule candidate was found. |

Do not treat `--fail-on risk` as a safety certification gate. It is useful for review attention and regression tripwires, but it can miss important safety rules.

If preset discovery finds no files, `--list-files` returns an empty list with exit code 0, while a real audit exits with `NO_FILES_FOUND`.

Experimental near-duplicate detection is opt-in:

```bash
rulemeter audit --preset all --experimental-similar
rulemeter audit --preset all --experimental-similar --similarity-threshold 0.8
```

The default similarity threshold is `0.65`. `similarCandidates` are review prompts, not automatic semantic dedupe.

## Presets

Use `--preset <name>` to discover known agent-instruction files from the current directory. Presets can be combined with explicit file paths; generated, dependency, and test fixture folders such as `node_modules/`, `dist/`, `.git/`, `coverage/`, `fixtures/`, `test/`, and `tests/` are skipped.

| Preset | Discovered files |
|---|---|
| `codex` | `AGENTS.md`, `AGENTS.override.md` in the repo tree |
| `claude` | `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/**/*.md`, `.claude/skills/**/*.md` |
| `copilot` | `AGENTS.md`, `AGENTS.override.md`, root `CLAUDE.md`, root `GEMINI.md`, `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` |
| `antigravity` | root `AGENTS.md`, root `GEMINI.md`, `.agents/agents.md`, `.agents/skills/**/*.md`, `.agents/workflows/**/*.md` |
| `all` | Union of all presets |

Preview discovery without auditing:

```bash
rulemeter audit --preset all --list-files
rulemeter audit --preset all --list-files --json
```

## Config

`RuleMeter` auto-loads `rulemeter.config.json` from the current directory when present. You can also pass `--config <path>`.

```json
{
  "minChars": 40,
  "minRepeats": 2
}
```

CLI flags override config values.

When a config file is loaded, table output prints `config: <path>` and JSON output includes `configPath`.

## Recommendations

| Recommendation | Meaning |
|---|---|
| `remove_duplicate` | Low-risk exact duplicate text repeats inside the same file and appears safe enough to review for deletion. |
| `review_duplicate` | Cross-file exact overlap appears in `surfaceOverlaps`. Review for drift, parity, or consolidation; do not treat it as a safe deletion instruction. |
| `keep_explicit` | The text matched a risk label, so duplicate removal should be reviewed carefully. |

## Risk Labels

- `identity`
- `pii`
- `approval_required`
- `test_required`
- `strategy_requires_ratification`
- `logs_or_errors`
- `security_policy`

Risk labels are conservative keyword matches for operational review. They are not semantic classification. Lines that merely inventory risk categories are skipped to reduce self-reference noise.

Known holdout blind spots include phrasing such as:

- `Never paste production database passwords into chat.`
- `Encrypt customer records at rest using AES-256.`
- `Rotate production credentials every 90 days.`
- `Get written sign-off from the release manager before shipping.`
- `Escape all SQL parameters before running a query.`

These are important safety rules, but the current keyword lint may not flag them. Do not rely on RuleMeter as the only review layer for security, privacy, approval, or release-safety instructions.

## Limits

- RuleMeter's default duplicate recommendations only group exact normalized same-file duplicate text.
- Cross-file duplicate text is summarized as `surfaceOverlaps` because different agents may need explicit parallel instructions.
- Experimental similar-rule detection uses lexical overlap and is off by default. Treat `similarCandidates` as review prompts, not proof of semantic equivalence.
- Risk findings are keyword-based and non-exhaustive; they can produce both false positives and false negatives.
- Markdown code fences, tables, blockquotes, and indented code are skipped; RuleMeter focuses on prose/list instruction text.
- Wrapped list items are joined before comparison so line wrapping does not create separate fragment rules.

## Verification

```bash
npm test
npm run dogfood
npm run validate:corpus
npm run pack:check
npm run smoke:install
npm audit --audit-level=high
```

`smoke:install` packs the current checkout into a local tarball, installs that tarball in a temporary consumer project with package lifecycle scripts disabled, and verifies the installed `rulemeter` binary. This keeps release validation useful even when npm publication is deferred.

`validate:corpus` runs a non-strict smoke of the corpus validation harness against `validation/corpus.example.json`. CI runs it to catch script rot, not to claim product usefulness. For real validation, pass a private manifest of owned instruction files to `scripts/validate-corpus.mjs`; see `docs/validation.md`.

## Release Decision

Do not publish the npm package or market RuleMeter as a standalone public tool until a private real-instruction corpus passes strict validation. The corpus should meet the evidence targets in `docs/validation.md`: same-file duplicate usefulness near 80%, surface-overlap usefulness near 60%, risk-finding usefulness near 60%, and review burden at or below 20 risk findings per 1,000 instruction lines.

If those targets do not hold, keep RuleMeter private or absorb it into `create-starter audit-agent-rules` as an internal helper instead of publishing it as a standalone package.

## Scope

This repo exists to validate whether agent-rule advisory linting is useful as a small standalone tool. If it proves useful repeatedly, the intended absorption path is `create-starter audit-agent-rules`.
