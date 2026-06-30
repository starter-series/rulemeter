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
  assert.match(translations.en["evidence.verdict.value"], /standalone deferred/u);
  assert.match(translations.en["footer.status"], /standalone release is deferred/u);
  assert.doesNotMatch(translations.en["install.body"], /publish-ready/u);
});

test("README narrows drift claims to exact and lexical review", async () => {
  const readme = await readFile("README.md", "utf8");

  assert.match(readme, /exact and lexical agent-instruction drift/u);
  assert.match(readme, /not automatic semantic dedupe/u);
  assert.match(readme, /Do not use it as a semantic drift detector/u);
  assert.doesNotMatch(readme, /semantic drift detector for agent instructions/iu);
});

test("validation docs show the labelable findings JSON shape", async () => {
  const docs = await readFile("docs/validation.md", "utf8");

  assert.match(docs, /"findings": \[/u);
  assert.match(docs, /"fingerprint": "abc123def4567890"/u);
  assert.match(docs, /"kind": "surface_overlap"/u);
  assert.match(docs, /"schemaVersion": "rulemeter.validation.labels.v1"/u);
  assert.match(docs, /--labels labels\.review\.json/u);
});
