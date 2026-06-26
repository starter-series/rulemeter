export const expectedPackFiles = [
  "LICENSE",
  "README.md",
  "dist/audit.d.ts",
  "dist/audit.js",
  "dist/cli.d.ts",
  "dist/cli.js",
  "dist/config.d.ts",
  "dist/config.js",
  "dist/errors.d.ts",
  "dist/errors.js",
  "dist/format.d.ts",
  "dist/format.js",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/presets.d.ts",
  "dist/presets.js",
  "dist/risk.d.ts",
  "dist/risk.js",
  "dist/schema.d.ts",
  "dist/schema.js",
  "package.json",
].sort();

export function assertPackInventory(pack) {
  if (!pack || !Array.isArray(pack.files)) {
    throw new Error("npm pack did not return a file list");
  }

  const actual = pack.files.map((file) => file.path).sort();
  const missing = expectedPackFiles.filter((path) => !actual.includes(path));
  const unexpected = actual.filter((path) => !expectedPackFiles.includes(path));

  if (missing.length > 0 || unexpected.length > 0) {
    const parts = [];
    if (missing.length > 0) parts.push(`missing packed files: ${missing.join(", ")}`);
    if (unexpected.length > 0) parts.push(`unexpected packed files: ${unexpected.join(", ")}`);
    throw new Error(parts.join("; "));
  }

  if (pack.entryCount !== expectedPackFiles.length) {
    throw new Error(`expected ${expectedPackFiles.length} packed files; got ${pack.entryCount}`);
  }

  const cli = pack.files.find((file) => file.path === "dist/cli.js");
  if (cli?.mode !== 0o755) {
    throw new Error(`dist/cli.js must be executable; got mode ${cli?.mode ?? "missing"}`);
  }
}
