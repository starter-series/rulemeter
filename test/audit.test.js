import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { auditRules, classifyRisks, computeBreakeven, RegexTokenCounter } from "../dist/index.js";

async function tempFile(name, content) {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-test-"));
  const path = join(dir, name);
  await writeFile(path, content, "utf8");
  return path;
}

test("computeBreakeven includes legend cost", () => {
  assert.equal(computeBreakeven(50, 2, 52), 2);
  assert.equal(computeBreakeven(2, 2, 4), null);
});

test("repeated low-risk rule is a candidate", async () => {
  const path = await tempFile(
    "task.md",
    [
      "- Preserve the existing module boundaries and keep edits narrowly scoped to the requested behavior.",
      "- Preserve the existing module boundaries and keep edits narrowly scoped to the requested behavior.",
    ].join("\n"),
  );
  const report = await auditRules([path], { counter: new RegexTokenCounter(), minTokens: 5 });
  assert.equal(report.schemaVersion, "rulemeter.audit.v1");
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].recommendation, "candidate");
  assert.ok(report.candidates[0].savedTokens > 0);
});

test("generic authoring and strategy words do not trigger high-risk labels alone", () => {
  const labels = classifyRisks("Use a clear authoring strategy for small helper functions.");
  assert.deepEqual(labels, []);
});

test("identity and PII rules stay explicit", async () => {
  const path = await tempFile(
    "AGENTS.md",
    [
      "- Public identity is Heznpc only and external surfaces must not include PII or API keys.",
      "- Public identity is Heznpc only and external surfaces must not include PII or API keys.",
    ].join("\n"),
  );
  const report = await auditRules([path], { counter: new RegexTokenCounter(), minTokens: 5 });
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].recommendation, "keep_explicit");
  assert.ok(report.candidates[0].risks.includes("identity"));
  assert.ok(report.candidates[0].risks.includes("pii"));
});

test("each high-risk family stays explicit", async () => {
  const cases = {
    approval_required: "Ask before any broad scan outside supplied files or before hard reset operations.",
    test_required: "Actually run tests and report the exact CI or local verification command before claiming success.",
    strategy_requires_ratification: "New strategy or constraint text enters configuration only after owner ratification.",
    logs_or_errors: "Do not compress logs, errors, stack trace, stderr, stdout, or build output excerpts.",
    security_policy: "Security policy, CVE status, vulnerability notes, secrets, and permission rules stay explicit.",
  };

  for (const [label, text] of Object.entries(cases)) {
    const path = await tempFile(`${label}.md`, `- ${text}\n- ${text}\n`);
    const report = await auditRules([path], { counter: new RegexTokenCounter(), minTokens: 5 });
    assert.equal(report.candidates.length, 1, label);
    assert.equal(report.candidates[0].recommendation, "keep_explicit", label);
    assert.ok(report.candidates[0].risks.includes(label), label);
  }
});
