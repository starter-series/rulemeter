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

```bash
npm install
npm run build
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
npm run dogfood
```

`RuleMeter` uses `js-tiktoken` by default and tries `o200k_base`, then `cl100k_base`. Pass `--encoding cl100k_base`, `--encoding o200k_base`, or `--model <name>` when you need an explicit tokenizer.

If the default tokenizer cannot be loaded, output falls back to `fallback_regex` and emits an `APPROXIMATE_TOKENIZER` warning. If you explicitly pass `--encoding` or `--model`, unknown tokenizer names fail instead of silently falling back. Use `--allow-fallback` only when approximate token counts are acceptable.

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

These default to `keep_explicit` because preserving critical instructions is more important than saving tokens.

## Verification

```bash
npm test
npm run dogfood
npm run pack:check
npm audit --audit-level=high
```

## Scope

This repo exists to validate whether agent-rule auditing is useful as a small standalone tool. If it proves useful repeatedly, the intended absorption path is `create-starter audit-agent-rules`.
