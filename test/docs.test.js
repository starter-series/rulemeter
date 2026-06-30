import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

async function translationsFromScript() {
  const source = await readFile("docs/script.js", "utf8");
  const context = {
    URLSearchParams,
    document: {
      documentElement: { lang: "en" },
      querySelectorAll() {
        return [];
      },
    },
    navigator: { language: "en-US" },
    window: {
      location: { search: "" },
      localStorage: {
        getItem() {
          return null;
        },
        setItem() {},
      },
    },
  };
  vm.runInNewContext(`${source}\nglobalThis.__translations = translations;`, context);
  return context.__translations;
}

test("GitHub Pages translations cover every visible i18n key", async () => {
  const html = await readFile("docs/index.html", "utf8");
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/gu)].map((match) => match[1]);
  const translations = await translationsFromScript();

  assert.ok(keys.includes("nav.evidence"));
  assert.ok(keys.includes("evidence.verdict.value"));
  for (const [language, dictionary] of Object.entries(translations)) {
    const missing = keys.filter((key) => !dictionary[key]);
    assert.deepEqual(missing, [], `${language} translations missing keys`);
  }
});

test("GitHub Pages states the current validation verdict without standalone overclaim", async () => {
  const html = await readFile("docs/index.html", "utf8");
  const translations = await translationsFromScript();

  assert.match(html, /standalone: deferred/u);
  assert.match(html, /release-checklist\.md/u);
  assert.match(translations.en["evidence.verdict.value"], /standalone deferred/u);
  assert.match(translations.en["footer.status"], /standalone release is deferred/u);
  assert.match(translations.en["install.checklist"], /release checklist/u);
  assert.match(translations.en["install.body"], /verify locally/u);
  assert.match(translations.en["evidence.private.value"], /not public proof/u);
  assert.doesNotMatch(html, /67 docs \/ 53 roots/u);
  assert.doesNotMatch(translations.en["install.body"], /publish-ready/u);
});

test("README avoids product drift claims and scopes lexical review", async () => {
  const readme = await readFile("README.md", "utf8");

  assert.match(readme, /cross-file verbatim overlap/u);
  assert.match(readme, /semantic drift findings/u);
  assert.match(readme, /not automatic semantic dedupe/u);
  assert.match(readme, /Do not use it as a semantic drift detector/u);
  assert.doesNotMatch(readme, /agent-instruction drift/u);
});

test("validation docs show the labelable findings JSON shape", async () => {
  const docs = await readFile("docs/validation.md", "utf8");

  assert.match(docs, /"findings": \[/u);
  assert.match(docs, /"fingerprint": "abc123def4567890"/u);
  assert.match(docs, /"kind": "surface_overlap"/u);
  assert.match(docs, /"schemaVersion": "rulemeter.validation.labels.v1"/u);
  assert.match(docs, /--labels labels\.review\.json/u);
});

test("release checklist keeps strict private corpus out of CI smoke", async () => {
  const checklist = await readFile("docs/release-checklist.md", "utf8");
  const readme = await readFile("README.md", "utf8");

  assert.match(checklist, /npm run validate:corpus` is intentionally non-strict/u);
  assert.match(checklist, /Standalone publication requires a private, owned, real-instruction corpus/u);
  assert.match(checklist, /requiredSignals": \["surface_overlap", "risk_summary"\]/u);
  assert.match(checklist, /Keep `README\.md` English-only/u);
  assert.match(readme, /docs\/release-checklist\.md/u);
});
