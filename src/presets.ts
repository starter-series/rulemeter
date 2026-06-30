import { readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export type PresetName = "codex" | "claude" | "copilot" | "antigravity" | "all";

export const presetNames: PresetName[] = ["codex", "claude", "copilot", "antigravity", "all"];

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "fixtures",
  "node_modules",
  "out",
  "test",
  "tests",
]);

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function isPresetName(value: string): value is PresetName {
  return (presetNames as string[]).includes(value);
}

async function walkMarkdownRoot(root: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name)) continue;
        await visit(resolve(directory, entry.name));
        continue;
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      files.push(normalizePath(relative(root, resolve(directory, entry.name))));
    }
  }

  await visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}

function matchesCodex(path: string): boolean {
  const name = basename(path);
  return name === "AGENTS.md" || name === "AGENTS.override.md";
}

function matchesClaude(path: string): boolean {
  if (basename(path) === "CLAUDE.md") return true;
  if (/^\.claude\/(?:rules|skills)\//u.test(path) && path.endsWith(".md")) return true;
  return path === ".claude/CLAUDE.md";
}

function matchesCopilot(path: string): boolean {
  if (matchesCodex(path)) return true;
  if (path === "CLAUDE.md" || path === "GEMINI.md") return true;
  if (path === ".github/copilot-instructions.md") return true;
  return /^\.github\/instructions\/[^/]+\.instructions\.md$/u.test(path);
}

function matchesAntigravity(path: string): boolean {
  if (path === "AGENTS.md" || path === "GEMINI.md") return true;
  if (path === ".agents/agents.md") return true;
  return /^\.agents\/(?:skills|workflows)\/.+\.md$/u.test(path);
}

function matchesPreset(path: string, preset: Exclude<PresetName, "all">): boolean {
  if (preset === "codex") return matchesCodex(path);
  if (preset === "claude") return matchesClaude(path);
  if (preset === "copilot") return matchesCopilot(path);
  return matchesAntigravity(path);
}

export async function discoverPresetFiles(preset: string, root = process.cwd()): Promise<string[]> {
  if (!isPresetName(preset)) {
    throw new Error(`unknown preset: ${preset}`);
  }

  const resolvedRoot = resolve(root);
  const files = await walkMarkdownRoot(resolvedRoot);
  const selected = new Set<string>();
  const presets = preset === "all" ? presetNames.filter((name) => name !== "all") : [preset];

  for (const file of files) {
    if (presets.some((name) => matchesPreset(file, name as Exclude<PresetName, "all">))) {
      selected.add(file);
    }
  }

  return [...selected].sort((left, right) => left.localeCompare(right));
}
