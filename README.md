# RuleMeter

> Status: Lab — standalone validation before possible `create-starter audit-agent-rules` absorption.

`RuleMeter` audits agent instruction files such as `AGENTS.md`, `CLAUDE.md`, and task prompts for repeated rules that might be alias candidates.

It measures whether a rule alias actually pays for itself before it lets token-saving pressure blur critical instructions.

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

- RuleMeter only groups exact normalized duplicate text. It does not detect semantically similar rules yet.
- Token counts use OpenAI tokenizers by default, so non-OpenAI agent files should treat numbers as approximations.
- Stable prefix files such as `AGENTS.md` and `CLAUDE.md` may be cached by their host tools, so token savings can be less valuable than dynamic prompt savings.
- Markdown code fences, tables, blockquotes, and indented code are skipped; RuleMeter focuses on prose/list instruction text.

## Verification

```bash
npm test
npm run dogfood
npm run pack:check
npm audit --audit-level=high
```

## Scope

This repo exists to validate whether agent-rule auditing is useful as a small standalone tool. If it proves useful repeatedly, the intended absorption path is `create-starter audit-agent-rules`.
