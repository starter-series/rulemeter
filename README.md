# RuleMeter

> Status: Lab — standalone validation before possible `create-starter audit-agent-rules` absorption.

`RuleMeter` is a local instruction governance engine for agent instruction files. It tracks source-of-truth topology, repeated rules, owner-ratified exceptions, and new review deltas across files such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and Copilot instruction files.

Website: https://starter-series.github.io/rulemeter/

It helps maintainers review:

- same-file duplicated instruction text
- cross-file verbatim overlaps that may need parity or consolidation review
- source-of-truth topology warnings such as local overrides or byte-identical mirrors
- owner-ratified topology decisions stored in a local ledger
- a single review queue that combines current open review items without scoring them
- a stateful run report that separates new, changed, known, and resolved review work
- keyword-based review prompts that may deserve human attention
- optional lexical near-duplicate review prompts

It does not rewrite instruction files, compress prompts, score an agent harness, auto-sync instruction files, guarantee safety coverage, prove that an instruction set is secure, or replace a human review. The only built-in write paths are `.rulemeter/decisions.json` when `rulemeter decisions --accept ...` is used and `.rulemeter/state.json` when `rulemeter run --update-state` is used. Treat the report as a review aid, not an AI safety/security linter, runtime guardrail, harness scorecard, or enforcement engine.

## Install

From a clone. This is the current supported path while npm publication is deferred:

```bash
npm install
npm run build
node dist/cli.js audit --preset all --list-files
node dist/cli.js audit --preset all --format markdown
```

For a local binary during development:

```bash
npm link
rulemeter audit AGENTS.md CLAUDE.md task.txt
```

After a future package publication, the same `rulemeter` binary path should be the normal install flow. Do not treat `npx rulemeter` as live until the package is published.

## Usage

```bash
rulemeter audit AGENTS.md CLAUDE.md task.txt
rulemeter audit --preset all
rulemeter audit --preset claude --list-files
rulemeter audit --preset all --format markdown
rulemeter audit --preset all --fail-on duplicate
rulemeter audit --preset all --fail-on risk
rulemeter audit --preset all --experimental-similar --format markdown
rulemeter sources
rulemeter sources --preset all --format markdown
rulemeter decisions
rulemeter decisions --accept all
rulemeter decisions --fail-on unaccepted
rulemeter queue
rulemeter queue --format markdown
rulemeter queue --fail-on review
rulemeter run
rulemeter run --update-state
rulemeter run --fail-on new-review
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
- `rulemeter.sources.v2` for `sources --json`
- `rulemeter.decisions.v1` for `decisions --json`
- `rulemeter.queue.v1` for `queue --json`
- `rulemeter.run.v1` for `run --json`
- `rulemeter.state.v1` for `.rulemeter/state.json`
- `rulemeter.discovery.v1` for `audit --list-files --json`
- `rulemeter.error.v1` for JSON errors

`rulemeter.audit.v2` intentionally removes the earlier draft token/alias fields and `count` command surface. Treat new keys as additive within v2.

Important `audit --json` review keys:

- `candidates`: same-file exact duplicate candidates. Human reports call these "same-file duplicate actions"; the JSON key remains `candidates`.
- `surfaceOverlaps`: exact cross-file overlaps grouped by shared file set.
- `riskFindings`: line-level keyword risk matches.
- `riskSummaries`: risk matches grouped by label for human review.
- `similarCandidates`: optional lexical near-duplicate candidates, emitted only with `--experimental-similar`.

`riskFindings` lists keyword-based risk matches independently from duplicate candidates, so `--fail-on risk` can catch single-stated rules. `riskSummaries` groups those matches by label for human review. This is still best-effort and non-exhaustive.

`surfaceOverlaps` summarizes exact cross-file overlaps by the set of files that share text. These are review prompts for parity or consolidation, not deletion instructions or semantic drift findings.

`rulemeter.sources.v2` reports source-of-truth topology for agent instruction files using filesystem and syntax facts: symlinks, `@path.md` imports, byte-identical mirrors, supplemental layers, and local overrides. It does not use semantic similarity or keyword-risk classification. Import detection matches how agent harnesses read `@` references: text inside fenced code blocks and inline code spans is ignored, and the `@` must start a whitespace-separated token, so backticked examples and email-like text are not treated as imports.

Human-readable `sources` reports classify files as:

| Role | Meaning |
|---|---|
| `canonical` | Selected source file, usually `AGENTS.md` or the target referenced by other files. |
| `symlink_alias` | File is a symlink to the canonical source. |
| `import_alias` | File imports the canonical source with an `@path.md` reference and contains no other instruction text. A file that imports canonical but adds its own rules is reported as `local_override` instead. |
| `verbatim_mirror` | File is byte-identical to canonical, but is not symlink/import-backed. |
| `contextual_layer` | Supplemental instruction layer that loads in addition to the canonical source: nested `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`, `CLAUDE.local.md`, and modular rule or skill files such as `.claude/rules/**`, `.claude/skills/**`, `.cursor/rules/**`, `.github/instructions/**`, and `.agents/rules|skills|workflows/**`. Not flagged as an override and does not create decision items. Exception: memory files directly under `.claude/` or `.agents/` (for example `.claude/CLAUDE.md`) are alternate root locations for the same memory, so a divergent copy is still reported as `local_override`. |
| `local_override` | File differs from canonical and should be confirmed as intentional. |

`rulemeter.decisions.v1` compares current source-topology warning fingerprints against `.rulemeter/decisions.json`. Decision keys are structural (`kind`, warning signal, subject path, and target path); evidence hashes are stored separately so a previously accepted local override can become `stale` when the underlying file content or topology evidence changes.

`rulemeter.queue.v1` combines current open review items from `audit` and `decisions` into one scoreless queue. Source decision items, same-file duplicate actions, cross-file surface overlaps, and optional lexical similar candidates are `review` priority. Keyword risk summaries are `hint` priority because they are non-exhaustive.

`rulemeter.run.v1` compares the current queue against `.rulemeter/state.json` and classifies current items as `new`, `changed`, or `known`. Items that existed in the previous state but no longer exist in the current queue are reported as `resolved`. `rulemeter.state.v1` stores queue item metadata and fingerprints only; it does not store instruction-file contents.

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
rulemeter decisions --fail-on unaccepted
rulemeter queue --fail-on review
rulemeter queue --fail-on any
rulemeter run --fail-on new-review
rulemeter run --fail-on delta-review
rulemeter run --fail-on any-delta
```

| Gate | Fails when |
|---|---|
| `duplicate` | At least one same-file exact duplicate candidate recommends `remove_duplicate`. Cross-file `surfaceOverlaps` are report-only. |
| `risk` | At least one best-effort risk finding was found. |
| `similar` | At least one experimental similar-rule candidate was found. |
| `decisions --fail-on pending` | At least one current topology warning has no accepted ledger entry. |
| `decisions --fail-on stale` | At least one accepted topology warning changed evidence. |
| `decisions --fail-on unaccepted` | At least one current topology warning is pending or stale. |
| `queue --fail-on review` | At least one non-hint queue item is open. Keyword hints do not trigger this gate. |
| `queue --fail-on any` | At least one queue item is open, including keyword hints. |
| `run --fail-on new-review` | At least one newly seen non-hint queue item exists compared with `.rulemeter/state.json`. |
| `run --fail-on changed-review` | At least one previously seen non-hint queue item has changed evidence. |
| `run --fail-on delta-review` | At least one new or changed non-hint queue item exists. |
| `run --fail-on any-delta` | At least one current item is new or changed, or one previous item resolved. |

Do not treat `--fail-on risk` as a safety certification gate. It is useful for review attention and regression tripwires, but it can miss important safety rules.

If preset discovery finds no files, `--list-files` returns an empty list with exit code 0, while a real audit exits with `NO_FILES_FOUND`.

Experimental near-duplicate detection is opt-in:

```bash
rulemeter audit --preset all --experimental-similar
rulemeter audit --preset all --experimental-similar --similarity-threshold 0.8
```

The default similarity threshold is `0.65`. `similarCandidates` are lexical review prompts, not automatic semantic dedupe. They work best when instructions still share most important words, and can miss semantically related rewrites that use different vocabulary.

## Presets

Use `--preset <name>` to discover known agent-instruction files from the current directory. Presets can be combined with explicit file paths; generated, dependency, and test fixture folders such as `node_modules/`, `dist/`, `.git/`, `coverage/`, `fixtures/`, `test/`, and `tests/` are skipped.

| Preset | Discovered files |
|---|---|
| `codex` | `AGENTS.md`, `AGENTS.override.md` in the repo tree |
| `claude` | `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/**/*.md`, `.claude/skills/**/*.md` |
| `copilot` | `AGENTS.md`, `AGENTS.override.md`, root `CLAUDE.md`, root `GEMINI.md`, `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md` |
| `antigravity` | `AGENTS.md`, `GEMINI.md`, `.agents/agents.md`, `.agents/rules/**/*.md`, `.agents/skills/**/*.md`, `.agents/workflows/**/*.md` |
| `cursor` | `AGENTS.md`, `AGENTS.override.md`, `.cursorrules`, `.cursor/rules/**/*.md`, `.cursor/rules/**/*.mdc` |
| `vscode` | `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/**/*.md`, `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md` |
| `all` | Union of all presets |

Preview discovery without auditing:

```bash
rulemeter audit --preset all --list-files
rulemeter audit --preset all --list-files --json
```

Inspect source-of-truth topology:

```bash
rulemeter sources
rulemeter sources --preset all --format markdown
rulemeter sources AGENTS.md CLAUDE.md .github/copilot-instructions.md --json
```

## Decision Ledger

Use `rulemeter decisions` after `rulemeter sources` when a source-topology warning is intentional and should not keep appearing as new review work.

```bash
rulemeter decisions
rulemeter decisions --format markdown
rulemeter decisions --accept all
rulemeter decisions --accept DEC_123456789ABC --note "Intentional tool-specific override."
rulemeter decisions --fail-on unaccepted
```

By default, the ledger path is `.rulemeter/decisions.json`. The command reads instruction files and writes only the ledger when `--accept` is used. It does not edit `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, Copilot files, or other instruction surfaces.

Decision statuses:

| Status | Meaning |
|---|---|
| `pending` | Current source-topology warning has not been accepted in the ledger. |
| `accepted` | Current warning matches an accepted ledger entry and evidence hash. |
| `stale` | A matching ledger entry exists, but current evidence changed and should be re-ratified. |

The initial ledger scope is source-topology warnings only: local overrides, byte-identical mirrors that are not symlink/import-backed, symlink targets outside the scan, and import targets outside the scan. It is not a general policy approval database, and it does not infer semantic equivalence.

## Review Queue

Use `rulemeter queue` when you want the current review surface in one place.

```bash
rulemeter queue
rulemeter queue --format markdown
rulemeter queue --fail-on review
rulemeter queue --experimental-similar --format markdown
```

The queue is scoreless and read-only. It does not rank files, grade an agent setup, infer semantic drift, or write the decision ledger. It combines:

| Queue kind | Priority | Source |
|---|---|---|
| `decision` | `review` | Pending or stale source-topology decisions from `.rulemeter/decisions.json`. |
| `duplicate` | `review` | Same-file exact duplicate actions from `audit`. |
| `surface_overlap` | `review` | Cross-file exact overlap reviews from `audit`. |
| `similar` | `review` | Optional lexical similarity reviews when `--experimental-similar` is enabled. |
| `risk_summary` | `hint` | Keyword risk summaries from `audit`; non-exhaustive and not a safety guarantee. |

Use `queue --fail-on review` when CI should fail only for non-hint review work. Use `queue --fail-on any` only if keyword hints should also fail the run.

## Stateful Run

Use `rulemeter run` when RuleMeter is called repeatedly by a local Codex, Claude, or CI harness and you only want the delta since the previous run.

```bash
rulemeter run
rulemeter run --format markdown
rulemeter run --update-state
rulemeter run --fail-on new-review
```

By default, `run` reads `.rulemeter/state.json` if it exists and prints a delta report without writing state. Add `--update-state` after a reviewed run to record the current queue fingerprints. The state file tracks queue item metadata and hashes only; it does not copy instruction-file text.

`--update-state` cannot be combined with `--fail-on`. Run fail-on gates before review, then update state only after the delta has been accepted or handled.

Run statuses:

| Status | Meaning |
|---|---|
| `new` | Current queue item was not present in the previous state. |
| `changed` | Current queue item matches a previous item key, but its fingerprint changed. |
| `known` | Current queue item matches the previous fingerprint. |
| `resolved` | Previous item is absent from the current queue. |

The intended loop is:

```bash
rulemeter run --preset all --format markdown
# review the delta
rulemeter run --preset all --update-state
```

Use `run --fail-on new-review` or `run --fail-on delta-review` for pre-merge tripwires that should react only to new or changed non-hint review work, instead of failing forever on already-known queue items.

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
| `review_duplicate` | Cross-file exact overlap appears in `surfaceOverlaps`. Review for parity or consolidation; do not treat it as a safe deletion instruction. |
| `keep_explicit` | The text matched a risk label, so duplicate removal should be reviewed carefully. |

Human-readable table and Markdown reports translate these raw JSON recommendation values into action labels such as "Probably removable", "Keep explicit", and "Review for parity or consolidation".

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
- Source topology checks are filesystem/syntax checks only. They can identify symlinks, `@path.md` imports, byte-identical mirrors, supplemental layers, and local overrides, but they do not infer whether two different files are semantically aligned.
- Import detection ignores fenced code blocks and inline code spans, requires the `@` reference to start a whitespace-separated token, and only recognizes `.md`/`.txt` targets. Extension-less imports such as `@README` are not recognized yet.
- Supplemental layers (nested memory files, `CLAUDE.local.md`, and modular rule/skill directories) are excluded from override warnings, but their text still participates in duplicate, overlap, and risk review during `audit`.
- The review queue is an aggregation view over existing signals. It does not introduce a stronger classifier or product-quality score.
- The stateful run report only compares deterministic queue fingerprints. It is an operating aid for repeat runs, not a behavioral evaluation of the agent harness.
- Experimental similar-rule detection uses lexical overlap and is off by default. Treat `similarCandidates` as review prompts, not proof of semantic equivalence.
- Similar-rule detection can catch near repeats such as reordered shared wording, but it can miss meaning-preserving rewrites that swap most vocabulary. Do not use it as a semantic drift detector.
- Risk findings are keyword-based and non-exhaustive; they can produce both false positives and false negatives.
- RuleMeter does not score an agent harness, evaluate model behavior, run red-team attacks, or open automated rewrite PRs. It reviews instruction-file surfaces only.
- Markdown code fences, tables, blockquotes, indented code, and a leading YAML frontmatter block (one that contains key-like `name:` lines) are skipped; RuleMeter focuses on prose/list instruction text. Skill frontmatter metadata such as `description:` is therefore not audited as an instruction rule.
- Wrapped list items are joined before comparison so line wrapping does not create separate fragment rules.

## Verification

```bash
npm run verify:local
```

`verify:local` runs the full local gate:

```bash
npm test
npm run dogfood
npm run validate:corpus
npm run pack:check
npm run smoke:install
npm audit --audit-level=high
```

`smoke:install` packs the current checkout into a local tarball, then installs that tarball in a temporary consumer project with consumer package lifecycle scripts disabled, and verifies the installed `rulemeter` binary. The source checkout may still run its normal `prepare`/build path while packing. This keeps release validation useful even when npm publication is deferred.

`validate:corpus` runs a non-strict smoke of the corpus validation harness against `validation/corpus.example.json`. CI runs it to catch script rot, not to claim product usefulness. For real validation, generate or maintain a private manifest of owned instruction files with `scripts/collect-corpus.mjs`, pass it to `scripts/validate-corpus.mjs`, use `--label-template` to create a private review file for current fingerprints, and feed reviewed labels back with `--labels`. See `docs/validation.md`.

## Release Decision

Use [`docs/release-checklist.md`](docs/release-checklist.md) before any standalone publish or absorption decision.

Do not publish the npm package or market RuleMeter as a standalone public tool until a private real-instruction corpus passes strict validation with every report finding manually labeled, no stale labels, and holdout usefulness measured separately. The default standalone-release policy requires same-file duplicates, cross-file surface overlaps, and risk summaries to be present and useful; a manifest can narrow `thresholds.requiredSignals` for internal-helper validation, but that narrowed pass is not standalone release evidence.

The corpus should meet the evidence targets in `docs/validation.md`: same-file duplicate usefulness near 80%, surface-overlap usefulness near 60%, risk-summary usefulness near 60%, review item load at or below 20 report findings per 1,000 instruction lines, and risk load at or below 20 underlying risk findings per 1,000 instruction lines.

If those targets do not hold, keep RuleMeter private or absorb it into `create-starter audit-agent-rules` as an internal helper instead of publishing it as a standalone package.

## Scope

This repo exists to validate whether non-scoring local instruction governance is useful as a small standalone tool and as a repeatable harness primitive. If it proves useful repeatedly, the intended absorption path is `create-starter audit-agent-rules`.
