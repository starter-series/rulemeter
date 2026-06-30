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
