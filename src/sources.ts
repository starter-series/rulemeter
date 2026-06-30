import { createHash } from "node:crypto";
import { lstat, readFile, readlink } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import type { RulemeterWarning } from "./schema.js";
import { SOURCES_SCHEMA_VERSION } from "./schema.js";

export type SourceRole = "canonical" | "import_alias" | "symlink_alias" | "verbatim_mirror" | "local_override";
export type SourceStrategy = "standalone" | "single_source" | "mixed" | "unresolved";

export interface SourceImportReference {
  specifier: string;
  path: string;
  existsInScan: boolean;
}

export interface SourceFile {
  path: string;
  role: SourceRole;
  evidence: string;
  imports: SourceImportReference[];
  isSymlink: boolean;
  symlinkTarget: string | null;
  byteIdenticalTo: string | null;
  sha256: string;
}

export interface SourceReport {
  schemaVersion: typeof SOURCES_SCHEMA_VERSION;
  files: SourceFile[];
  canonicalPath: string | null;
  sourceStrategy: SourceStrategy;
  warnings: RulemeterWarning[];
  preset?: string | null;
  discoveredFiles?: string[];
}

interface LoadedSource {
  inputPath: string;
  path: string;
  absolutePath: string;
  text: string;
  bytes: Buffer;
  sha256: string;
  isSymlink: boolean;
  symlinkTarget: string | null;
  symlinkTargetAbsolute: string | null;
  imports: SourceImportReference[];
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function displayPath(path: string, root: string): string {
  const relativePath = normalizePath(relative(root, path));
  return relativePath.startsWith("..") ? normalizePath(path) : relativePath || ".";
}

function hashBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function importReferences(text: string, filePath: string, root: string, scannedPaths: Set<string>): SourceImportReference[] {
  const references: SourceImportReference[] = [];
  const seen = new Set<string>();
  const pattern = /@([^\s"'<>()[\]{}]+?\.(?:md|txt))/giu;
  for (const match of text.matchAll(pattern)) {
    const rawSpecifier = match[1];
    if (!rawSpecifier) continue;
    const specifier = rawSpecifier.replace(/[.,;:]+$/u, "");
    const absolute = resolve(dirname(filePath), specifier);
    const path = displayPath(absolute, root);
    const key = `${specifier}\0${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push({ specifier, path, existsInScan: scannedPaths.has(path) });
  }
  return references;
}

function canonicalPreference(path: string): number {
  if (path === "AGENTS.md") return 0;
  if (path.endsWith("/AGENTS.md")) return 1;
  if (path === "CLAUDE.md") return 2;
  if (path === "GEMINI.md") return 3;
  if (path === ".github/copilot-instructions.md") return 4;
  if (path === ".agents/agents.md") return 5;
  return 10;
}

function chooseCanonical(files: LoadedSource[]): string | null {
  if (files.length === 0) return null;
  const scanned = new Set(files.map((file) => file.path));
  const inbound = new Map<string, number>();
  for (const file of files) {
    if (file.symlinkTarget && scanned.has(file.symlinkTarget)) {
      inbound.set(file.symlinkTarget, (inbound.get(file.symlinkTarget) ?? 0) + 2);
    }
    for (const reference of file.imports) {
      if (reference.existsInScan) inbound.set(reference.path, (inbound.get(reference.path) ?? 0) + 1);
    }
  }

  return [...files]
    .sort((left, right) => {
      const inboundDelta = (inbound.get(right.path) ?? 0) - (inbound.get(left.path) ?? 0);
      if (inboundDelta !== 0) return inboundDelta;
      const preferenceDelta = canonicalPreference(left.path) - canonicalPreference(right.path);
      if (preferenceDelta !== 0) return preferenceDelta;
      return left.path.localeCompare(right.path);
    })[0]?.path ?? null;
}

function roleFor(file: LoadedSource, canonical: LoadedSource | undefined, scannedPaths: Set<string>): Pick<SourceFile, "role" | "evidence" | "byteIdenticalTo"> {
  if (!canonical) return { role: "local_override", evidence: "no canonical file selected", byteIdenticalTo: null };
  if (file.path === canonical.path) return { role: "canonical", evidence: "selected source file", byteIdenticalTo: null };
  if (file.symlinkTarget === canonical.path) {
    return { role: "symlink_alias", evidence: `symlink to ${canonical.path}`, byteIdenticalTo: null };
  }
  const canonicalImport = file.imports.find((reference) => reference.path === canonical.path);
  if (canonicalImport) {
    return { role: "import_alias", evidence: `imports @${canonicalImport.specifier}`, byteIdenticalTo: null };
  }
  if (file.sha256 === canonical.sha256) {
    return { role: "verbatim_mirror", evidence: `byte-identical to ${canonical.path}`, byteIdenticalTo: canonical.path };
  }
  if (file.isSymlink && file.symlinkTarget && !scannedPaths.has(file.symlinkTarget)) {
    return { role: "symlink_alias", evidence: `symlink target outside scan: ${file.symlinkTarget}`, byteIdenticalTo: null };
  }
  const scannedImport = file.imports.find((reference) => reference.existsInScan);
  if (scannedImport) {
    return { role: "import_alias", evidence: `imports @${scannedImport.specifier}`, byteIdenticalTo: null };
  }
  return { role: "local_override", evidence: `differs from ${canonical.path}`, byteIdenticalTo: null };
}

function sourceStrategy(files: SourceFile[], canonicalPath: string | null): SourceStrategy {
  if (files.length <= 1) return "standalone";
  const nonCanonical = files.filter((file) => file.role !== "canonical");
  if (nonCanonical.length === 0) return "standalone";
  if (
    canonicalPath &&
    nonCanonical.every(
      (file) =>
        (file.role === "symlink_alias" && file.symlinkTarget === canonicalPath) ||
        (file.role === "import_alias" && file.imports.some((reference) => reference.path === canonicalPath)),
    )
  ) {
    return "single_source";
  }
  if (files.some((file) => file.role === "canonical")) return "mixed";
  return "unresolved";
}

function sourceWarnings(files: SourceFile[], canonicalPath: string | null): RulemeterWarning[] {
  const warnings: RulemeterWarning[] = [];
  for (const file of files) {
    if (file.role === "verbatim_mirror") {
      warnings.push({
        code: "VERBATIM_MIRROR_NOT_LINKED",
        message: `${file.path} is byte-identical to ${file.byteIdenticalTo ?? canonicalPath} but is not symlink/import-backed`,
      });
    }
    if (file.role === "local_override" && canonicalPath) {
      warnings.push({
        code: "LOCAL_OVERRIDE",
        message: `${file.path} differs from ${canonicalPath}; confirm this override is intentional`,
      });
    }
    if (file.isSymlink && file.symlinkTarget && !files.some((candidate) => candidate.path === file.symlinkTarget)) {
      warnings.push({
        code: "SYMLINK_TARGET_OUTSIDE_SCAN",
        message: `${file.path} points to ${file.symlinkTarget}, which is outside the scanned instruction files`,
      });
    }
    for (const reference of file.imports) {
      if (!reference.existsInScan) {
        warnings.push({
          code: "IMPORT_TARGET_OUTSIDE_SCAN",
          message: `${file.path} imports @${reference.specifier}, which is outside the scanned instruction files`,
        });
      }
    }
  }
  return warnings;
}

export async function analyzeInstructionSources(paths: string[], root = process.cwd()): Promise<SourceReport> {
  const resolvedRoot = resolve(root);
  const uniqueInputs = [...new Set(paths)].sort((left, right) => left.localeCompare(right));
  const scannedAbsolute = uniqueInputs.map((path) => resolve(resolvedRoot, path));
  const scannedPaths = new Set(scannedAbsolute.map((path) => displayPath(path, resolvedRoot)));
  const loadedWithoutImports: Omit<LoadedSource, "imports">[] = [];

  for (const inputPath of uniqueInputs) {
    const absolutePath = resolve(resolvedRoot, inputPath);
    const stats = await lstat(absolutePath);
    const bytes = await readFile(absolutePath);
    const isSymlink = stats.isSymbolicLink();
    const symlinkTargetRaw = isSymlink ? await readlink(absolutePath) : null;
    const symlinkTargetAbsolute = symlinkTargetRaw ? resolve(dirname(absolutePath), symlinkTargetRaw) : null;
    loadedWithoutImports.push({
      inputPath,
      path: displayPath(absolutePath, resolvedRoot),
      absolutePath,
      text: bytes.toString("utf8"),
      bytes,
      sha256: hashBytes(bytes),
      isSymlink,
      symlinkTarget: symlinkTargetAbsolute ? displayPath(symlinkTargetAbsolute, resolvedRoot) : null,
      symlinkTargetAbsolute,
    });
  }

  const loaded: LoadedSource[] = loadedWithoutImports.map((file) => ({
    ...file,
    imports: importReferences(file.text, file.absolutePath, resolvedRoot, scannedPaths),
  }));
  const canonicalPath = chooseCanonical(loaded);
  const canonical = loaded.find((file) => file.path === canonicalPath);

  const files: SourceFile[] = loaded
    .map((file) => {
      const role = roleFor(file, canonical, scannedPaths);
      return {
        path: file.path,
        role: role.role,
        evidence: role.evidence,
        imports: file.imports,
        isSymlink: file.isSymlink,
        symlinkTarget: file.symlinkTarget,
        byteIdenticalTo: role.byteIdenticalTo,
        sha256: file.sha256,
      };
    })
    .sort((left, right) => canonicalPreference(left.path) - canonicalPreference(right.path) || left.path.localeCompare(right.path));

  return {
    schemaVersion: SOURCES_SCHEMA_VERSION,
    files,
    canonicalPath,
    sourceStrategy: sourceStrategy(files, canonicalPath),
    warnings: sourceWarnings(files, canonicalPath),
  };
}
