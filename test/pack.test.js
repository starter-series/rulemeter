import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPackInventory, expectedPackFiles } from "../scripts/pack-inventory.mjs";

function expectedPack() {
  return {
    entryCount: expectedPackFiles.length,
    files: expectedPackFiles.map((path) => ({
      path,
      mode: path === "dist/cli.js" ? 0o755 : 0o644,
    })),
  };
}

test("pack inventory rejects stale tokenizer artifacts", () => {
  const pack = expectedPack();
  pack.entryCount += 1;
  pack.files.push({ path: "dist/tokenizer.js", mode: 0o644 });

  assert.throws(() => assertPackInventory(pack), /unexpected packed files: dist\/tokenizer\.js/);
});

test("pack inventory requires CLI executable mode", () => {
  const pack = expectedPack();
  pack.files = pack.files.map((file) => (file.path === "dist/cli.js" ? { ...file, mode: 0o644 } : file));

  assert.throws(() => assertPackInventory(pack), /dist\/cli\.js must be executable/);
});
