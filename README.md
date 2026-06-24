# RuleMeter

> Status: Lab — standalone validation before possible `create-starter audit-agent-rules` absorption.

`RuleMeter` audits agent instruction files such as `AGENTS.md`, `CLAUDE.md`, and task prompts for duplicated rules, token cost, and risky instruction compression.

It helps maintainers see which repeated rules can be deduplicated, which rules should stay explicit, and whether an alias would actually pay for itself before token-saving pressure blurs critical instructions.

It is not a general prompt compressor and it does not rewrite files. Its job is to measure:

- repeated rule text
- raw token estimate
- alias and legend cost
- break-even repeat count
- saved token estimate
- cache-prefix hint
- high-risk rules that should stay explicit

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
rulemeter audit --preset all --experimental-similar --format markdown
rulemeter audit AGENTS.md --json --encoding cl100k_base
rulemeter audit AGENTS.md --config rulemeter.config.json
rulemeter count "RULE_01 = preserve existing module boundaries" --encoding o200k_base
```

From source:

```bash
node dist/cli.js audit AGENTS.md CLAUDE.md task.txt
npm run dogfood
```

`RuleMeter` uses `js-tiktoken` by default and tries `o200k_base`, then `cl100k_base`. Pass `--encoding cl100k_base`, `--encoding o200k_base`, or `--model <name>` when you need an explicit tokenizer.

`js-tiktoken` is an OpenAI tokenizer implementation. For Claude, Gemini, Copilot, and Antigravity instruction files, token counts are useful as a consistent approximation and comparison signal, not as vendor billing-token truth. `--model` accepts model names known to `js-tiktoken`; for Claude or Gemini files, pass `--encoding o200k_base` or `--encoding cl100k_base` explicitly.

If the default tokenizer cannot be loaded, output falls back to `fallback_regex` and emits an `APPROXIMATE_TOKENIZER` warning. If you explicitly pass `--encoding` or `--model`, unknown tokenizer names fail instead of silently falling back. Use `--allow-fallback` only when approximate token counts are acceptable.

Exact duplicated rules usually save more by deleting the duplicate line than by introducing a legend plus alias. RuleMeter reports that as `remove_duplicate`; use alias candidates only when duplicate text must remain in multiple instruction surfaces.

## JSON Contract

Machine-readable output includes a stable `schemaVersion`:

- `rulemeter.audit.v1` for `audit --json`
- `rulemeter.count.v1` for `count --json`
- `rulemeter.error.v1` for JSON errors

Treat new keys as additive. Existing v1 key names are intended to stay stable.

Table output uses the compact column name `dedupe_saved`; JSON uses `duplicateSavedTokens` for the same value.

Errors use `rulemeter.error.v1` and stable `error.code` values for automation. Common user-facing codes include `NO_FILES_FOUND`, `FILE_NOT_FOUND`, `NOT_A_FILE`, `CONFIG_NOT_FOUND`, `CONFIG_INVALID_JSON`, `CONFIG_INVALID`, `INVALID_ALIAS_PREFIX`, `INVALID_OPTION`, `UNKNOWN_FLAG`, `UNKNOWN_COMMAND`, and `TOKENIZER_NOT_FOUND`.

## Reports And Gates

Use Markdown output for PR comments or CI summaries:

```bash
rulemeter audit --preset all --format markdown
```

Use `--fail-on` to make CI fail after printing the normal report:

```bash
rulemeter audit --preset all --fail-on duplicate
rulemeter audit --preset all --fail-on risk
rulemeter audit --preset all --fail-on candidate
rulemeter audit --preset all --experimental-similar --fail-on similar
```

| Gate | Fails when |
|---|---|
| `duplicate` | At least one candidate recommends `remove_duplicate`. |
| `risk` | At least one candidate has a high-risk label. |
| `candidate` | At least one candidate recommends `candidate`. |
| `similar` | At least one experimental similar-rule candidate was found. |

If preset discovery finds no files, `--list-files` returns an empty list with exit code 0, while a real audit exits with `NO_FILES_FOUND`.

Experimental near-duplicate detection is opt-in:

```bash
rulemeter audit --preset all --experimental-similar
rulemeter audit --preset all --experimental-similar --similarity-threshold 0.8
```

The default similarity threshold is `0.65`. `similarCandidates` are additive JSON fields under `rulemeter.audit.v1`. They are review prompts, not automatic dedupe or alias recommendations.

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
  "aliasPrefix": "RULE",
  "allowFallback": false,
  "encoding": "o200k_base",
  "minRepeats": 2,
  "minTokens": 12
}
```

CLI flags override config values.

When a config file is loaded, table output prints `config: <path>` and JSON output includes `configPath`.

## Recommendations

| Recommendation | Meaning |
|---|---|
| `candidate` | Alias could save tokens and no high-risk label was detected. |
| `keep_explicit` | The rule mentions identity, PII, approval, tests, strategy ratification, logs, errors, or security. |
| `remove_duplicate` | Exact duplicate text was found; deleting duplicate occurrences saves more than introducing an alias. |
| `do_not_alias` | Alias is not useful under the current thresholds. |
| `below_breakeven` | Alias might help later, but current repeat count is too low. |

## Risk Labels

- `identity`
- `pii`
- `approval_required`
- `test_required`
- `strategy_requires_ratification`
- `logs_or_errors`
- `security_policy`

These default to `keep_explicit` because preserving critical instructions is more important than saving tokens. Risk labels are conservative keyword matches, not semantic classification; expect some false positives.

## Limits

- RuleMeter's default recommendations only group exact normalized duplicate text.
- Experimental similar-rule detection uses lexical overlap and is off by default. Treat `similarCandidates` as review prompts, not proof of semantic equivalence.
- Token counts use OpenAI tokenizers by default, so non-OpenAI agent files should treat numbers as approximations.
- Stable prefix files such as `AGENTS.md` and `CLAUDE.md` may be cached by their host tools, so token savings can be less valuable than dynamic prompt savings.
- Markdown code fences, tables, blockquotes, and indented code are skipped; RuleMeter focuses on prose/list instruction text.
- Wrapped list items are joined before comparison so line wrapping does not create separate fragment rules.

## Verification

```bash
npm test
npm run dogfood
npm run pack:check
npm run smoke:install
npm audit --audit-level=high
```

`smoke:install` packs the current checkout into a local tarball, installs that tarball in a temporary consumer project with package lifecycle scripts disabled, and verifies the installed `rulemeter` binary. This keeps release validation useful even when npm publication is deferred.

## Scope

This repo exists to validate whether agent-rule auditing is useful as a small standalone tool. If it proves useful repeatedly, the intended absorption path is `create-starter audit-agent-rules`.
