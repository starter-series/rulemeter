# Pre-registered usage trial — governance lane (v0.1.0)

> Status: owner-ratified 2026-07-02. Criteria are fixed before the trial
> starts. This file must not be edited during the trial window except to
> fill the Trial log section.

## Subject

Whether the governance lane (`sources` / `decisions` / `queue` / `run`)
earns a place in the owner's daily loop, measured on real repositories —
not fixtures. This is the survival test for the repo's Lab status: the
outcome decides whether the tool continues as a personal governance
instrument or is archived as a completed Lab experiment.

## Protocol

- **Window**: 4 weeks from the first wired session (start date recorded
  below).
- **Invocation**: automatic at session entry via the owner's session-entry
  automation. Advisory only: `rulemeter run` (read-only), no `--fail-on`,
  no `--update-state` at entry.
- **Adjudication**: owner-only. Decisions are recorded via
  `rulemeter decisions --accept <ID>` followed by an explicit
  `rulemeter run --update-state`. Sessions never auto-accept and never
  update state on their own — automated state updates would contaminate
  criterion 2.

## Pass criteria (all three required)

1. **Wiring survives.** The session-entry invocation remains enabled for
   the full window. Removing or disabling it is a FAIL, not a pause.
2. **Adjudication rate.** Findings with any delta (new/changed) lead to a
   recorded ledger decision or a repository fix at an average of at least
   one per week.
3. **Non-obvious catch.** At least one finding across the window that the
   owner judges would not have been noticed without the tool.

## Fail handling

If any criterion is missed, the verdict is recorded here as FAILED and the
repo is archived as a completed Lab experiment. Reframing the goal after
the fact is not permitted — no post-hoc rationalisation against a weaker
hypothesis the data happens to fit.

## Evidence sources

- `.rulemeter/decisions.json` and `.rulemeter/state.json` timestamps in
  trial repositories
- git history of fixes referencing rulemeter findings

## Trial log

- Start: _(recorded at first wired session)_
- Verdict: _(recorded at window close: PASSED / FAILED, with evidence)_
