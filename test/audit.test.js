import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { auditDocuments, auditRules, classifyRisks, computeBreakeven, RegexTokenCounter } from "../dist/index.js";

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

test("repeated low-risk rule prefers duplicate removal before aliasing", async () => {
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
  assert.equal(report.candidates[0].recommendation, "remove_duplicate");
  assert.ok(report.candidates[0].savedTokens > 0);
  assert.ok(report.candidates[0].duplicateSavedTokens > report.candidates[0].savedTokens);
});

test("generic authoring and strategy words do not trigger high-risk labels alone", () => {
  const labels = classifyRisks("Use a clear authoring strategy for small helper functions.");
  assert.deepEqual(labels, []);
});

test("common app words do not trigger high-risk labels alone", () => {
  const cases = [
    "Respect the user tool permission settings.",
    "Log in the user and redirect.",
    "Send a confirmation email.",
    "Fix the error state copy.",
    "Open the security settings screen.",
    "검색 키워드 입력란을 유지하세요.",
    "문서 작성자 정보를 표시하세요.",
  ];
  for (const text of cases) assert.deepEqual(classifyRisks(text), [], text);
});

test("risk findings scan single-stated rules outside duplicate candidates", async () => {
  const report = await auditDocuments(
    [
      {
        id: "memory://rules",
        text: "- Actually run tests and report the verification command before claiming success.",
      },
    ],
    { counter: new RegexTokenCounter(), minTokens: 5 },
  );
  assert.equal(report.candidates.length, 0);
  assert.equal(report.riskFindings.length, 1);
  assert.deepEqual(report.riskFindings[0].risks, ["test_required"]);
  assert.equal(report.riskFindings[0].occurrences[0].path, "memory://rules");
  assert.equal(report.riskFindings[0].occurrences[0].line, 1);
});

test("markdown code fences tables and blockquotes are skipped", async () => {
  const path = await tempFile(
    "CLAUDE.md",
    [
      "```bash",
      "npm run build && npm test",
      "```",
      "",
      "| Command | Meaning |",
      "|---|---|",
      "| npm test | test |",
      "",
      "> Quote this warning twice for context.",
      "> Quote this warning twice for context.",
      "",
      "- Preserve the existing module boundaries and keep edits narrowly scoped to the requested behavior.",
      "- Preserve the existing module boundaries and keep edits narrowly scoped to the requested behavior.",
    ].join("\n"),
  );
  const report = await auditRules([path], { counter: new RegexTokenCounter(), minTokens: 5 });
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].text, "Preserve the existing module boundaries and keep edits narrowly scoped to the requested behavior.");
});

test("wrapped list items stay one segment", async () => {
  const path = await tempFile(
    "AGENTS.md",
    [
      "- Preserve the existing module boundaries and keep edits narrowly scoped",
      "  to the requested behavior across touched files.",
      "- Preserve the existing module boundaries and keep edits narrowly scoped",
      "  to the requested behavior across touched files.",
    ].join("\n"),
  );
  const report = await auditRules([path], { counter: new RegexTokenCounter(), minTokens: 5 });
  assert.equal(report.candidates.length, 1);
  assert.equal(
    report.candidates[0].text,
    "Preserve the existing module boundaries and keep edits narrowly scoped to the requested behavior across touched files.",
  );
  assert.equal(report.candidates[0].occurrences[0].line, 1);
  assert.equal(report.candidates[0].occurrences[1].line, 3);
});

test("auditDocuments audits in-memory service inputs", async () => {
  const text = [
    "- Keep generated reports read-only and never rewrite user instruction files.",
    "- Keep generated reports read-only and never rewrite user instruction files.",
  ].join("\n");
  const report = await auditDocuments([{ id: "memory://rules", text }], { counter: new RegexTokenCounter(), minTokens: 5 });
  assert.deepEqual(report.files, ["memory://rules"]);
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].occurrences[0].path, "memory://rules");
});

test("experimental similar candidates find near duplicate rules", async () => {
  const report = await auditDocuments(
    [
      {
        id: "memory://rules",
        text: [
          "- Preserve existing module boundaries and keep edits narrowly scoped to requested behavior.",
          "- Keep edits narrowly scoped to requested behavior while preserving existing module boundaries.",
        ].join("\n"),
      },
    ],
    { counter: new RegexTokenCounter(), includeSimilar: true, minTokens: 5 },
  );
  assert.equal(report.candidates.length, 0);
  assert.equal(report.similarCandidates.length, 1);
  assert.equal(report.similarCandidates[0].recommendation, "review_similar");
  assert.ok(report.similarCandidates[0].similarity >= 0.5);
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
  assert.equal(report.riskFindings.length, 1);
  assert.ok(report.riskFindings[0].risks.includes("identity"));
  assert.ok(report.riskFindings[0].risks.includes("pii"));
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
    assert.equal(report.riskFindings.length, 1, label);
    assert.ok(report.riskFindings[0].risks.includes(label), label);
  }
});
