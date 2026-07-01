import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { RulemeterError } from "./errors.js";
import type { QueueItem, QueueReport } from "./queue.js";
import { RUN_SCHEMA_VERSION, STATE_SCHEMA_VERSION } from "./schema.js";

export const DEFAULT_STATE_PATH = ".rulemeter/state.json";

export type RunItemStatus = "new" | "changed" | "known";
export type RunFailOn = "new-review" | "changed-review" | "delta-review" | "any-delta";

export interface RulemeterStateItem extends QueueItem {
  key: string;
  fingerprint: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface RulemeterState {
  schemaVersion: typeof STATE_SCHEMA_VERSION;
  queueSchemaVersion: QueueReport["schemaVersion"];
  updatedAt: string | null;
  items: RulemeterStateItem[];
}

export interface RunItem extends QueueItem {
  status: RunItemStatus;
  key: string;
  fingerprint: string;
  previousFingerprint?: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ResolvedRunItem extends RulemeterStateItem {
  status: "resolved";
  resolvedAt: string;
}

export interface RunReport {
  schemaVersion: typeof RUN_SCHEMA_VERSION;
  stateSchemaVersion: typeof STATE_SCHEMA_VERSION;
  queueSchemaVersion: QueueReport["schemaVersion"];
  statePath: string;
  stateUpdated: boolean;
  generatedAt: string;
  files: string[];
  configPath?: string | null;
  discoveredFiles?: string[];
  preset?: string | null;
  ledgerPath: string;
  counts: {
    totalCurrent: number;
    new: number;
    changed: number;
    known: number;
    resolved: number;
    newReview: number;
    changedReview: number;
    deltaReview: number;
    anyDelta: number;
    byStatus: Record<RunItemStatus | "resolved", number>;
  };
  items: RunItem[];
  resolvedItems: ResolvedRunItem[];
}

export interface BuildRunReportOptions {
  statePath?: string;
  updateState?: boolean;
  now?: Date;
}

export interface BuildRunReportResult {
  report: RunReport;
  nextState: RulemeterState;
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function hashParts(parts: Array<string | null | undefined>): string {
  return createHash("sha256")
    .update(parts.map((part) => part ?? "").join("\0"))
    .digest("hex");
}

function shortHash(parts: Array<string | null | undefined>): string {
  return hashParts(parts).slice(0, 16);
}

function itemKey(item: QueueItem): string {
  return shortHash([item.kind, item.signal, item.paths.join("\n"), item.preview]);
}

function itemFingerprint(item: QueueItem): string {
  return hashParts([
    item.kind,
    item.priority,
    item.sourceId,
    item.signal,
    item.action,
    item.message,
    item.paths.join("\n"),
    item.locations.join("\n"),
    item.preview,
  ]);
}

function emptyState(): RulemeterState {
  return { schemaVersion: STATE_SCHEMA_VERSION, queueSchemaVersion: "rulemeter.queue.v1", updatedAt: null, items: [] };
}

function assertStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function assertStateItem(value: unknown, statePath: string): RulemeterStateItem {
  if (!value || typeof value !== "object") {
    throw new RulemeterError("STATE_INVALID", `${statePath} contains an invalid state item`);
  }
  const item = value as Partial<RulemeterStateItem>;
  if (
    typeof item.key !== "string" ||
    typeof item.fingerprint !== "string" ||
    typeof item.id !== "string" ||
    !["decision", "duplicate", "surface_overlap", "risk_summary", "similar"].includes(String(item.kind)) ||
    !["review", "hint"].includes(String(item.priority)) ||
    typeof item.sourceId !== "string" ||
    typeof item.signal !== "string" ||
    typeof item.action !== "string" ||
    typeof item.message !== "string" ||
    !assertStringArray(item.paths) ||
    !assertStringArray(item.locations) ||
    (item.preview !== null && typeof item.preview !== "string") ||
    typeof item.firstSeenAt !== "string" ||
    typeof item.lastSeenAt !== "string"
  ) {
    throw new RulemeterError("STATE_INVALID", `${statePath} contains an invalid state item`);
  }
  return item as RulemeterStateItem;
}

function assertState(value: unknown, statePath: string): RulemeterState {
  if (!value || typeof value !== "object") {
    throw new RulemeterError("STATE_INVALID", `${statePath} must be a JSON object`);
  }
  const candidate = value as Partial<RulemeterState>;
  if (candidate.schemaVersion !== STATE_SCHEMA_VERSION) {
    throw new RulemeterError("STATE_INVALID", `${statePath} schemaVersion must be ${STATE_SCHEMA_VERSION}`);
  }
  if (candidate.queueSchemaVersion !== "rulemeter.queue.v1") {
    throw new RulemeterError("STATE_INVALID", `${statePath} queueSchemaVersion must be rulemeter.queue.v1`);
  }
  if (candidate.updatedAt !== null && typeof candidate.updatedAt !== "string") {
    throw new RulemeterError("STATE_INVALID", `${statePath} updatedAt must be a string or null`);
  }
  if (!Array.isArray(candidate.items)) {
    throw new RulemeterError("STATE_INVALID", `${statePath} items must be an array`);
  }
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    queueSchemaVersion: "rulemeter.queue.v1",
    updatedAt: candidate.updatedAt ?? null,
    items: candidate.items.map((item) => assertStateItem(item, statePath)).sort((left, right) => left.key.localeCompare(right.key)),
  };
}

export async function loadRulemeterState(statePath = DEFAULT_STATE_PATH): Promise<RulemeterState> {
  try {
    const text = await readFile(statePath, "utf8");
    try {
      return assertState(JSON.parse(text), statePath);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new RulemeterError("STATE_INVALID_JSON", `${statePath} contains invalid JSON`);
      }
      throw error;
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return emptyState();
    throw error;
  }
}

export async function writeRulemeterState(state: RulemeterState, statePath = DEFAULT_STATE_PATH): Promise<void> {
  const normalizedPath = normalizePath(resolve(statePath));
  await mkdir(dirname(normalizedPath), { recursive: true });
  const sorted: RulemeterState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    queueSchemaVersion: state.queueSchemaVersion,
    updatedAt: state.updatedAt,
    items: [...state.items].sort((left, right) => left.key.localeCompare(right.key)),
  };
  await writeFile(normalizedPath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

function stateItemFromRunItem(item: RunItem): RulemeterStateItem {
  return {
    id: item.id,
    kind: item.kind,
    priority: item.priority,
    sourceId: item.sourceId,
    signal: item.signal,
    action: item.action,
    message: item.message,
    paths: item.paths,
    locations: item.locations,
    preview: null,
    key: item.key,
    fingerprint: item.fingerprint,
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
  };
}

export function buildRunReport(queueReport: QueueReport, state: RulemeterState = emptyState(), options: BuildRunReportOptions = {}): BuildRunReportResult {
  const generatedAt = (options.now ?? new Date()).toISOString();
  const previousByKey = new Map(state.items.map((item) => [item.key, item]));
  const currentKeys = new Set<string>();

  const items: RunItem[] = queueReport.items.map((item) => {
    const key = itemKey(item);
    const fingerprint = itemFingerprint(item);
    currentKeys.add(key);
    const previous = previousByKey.get(key);
    const status: RunItemStatus = previous ? (previous.fingerprint === fingerprint ? "known" : "changed") : "new";
    return {
      ...item,
      status,
      key,
      fingerprint,
      previousFingerprint: status === "changed" ? previous?.fingerprint : undefined,
      firstSeenAt: previous?.firstSeenAt ?? generatedAt,
      lastSeenAt: generatedAt,
    };
  });

  const resolvedItems: ResolvedRunItem[] = state.items
    .filter((item) => !currentKeys.has(item.key))
    .map((item) => ({ ...item, status: "resolved" as const, resolvedAt: generatedAt }))
    .sort((left, right) => left.key.localeCompare(right.key));

  const counts = {
    totalCurrent: items.length,
    new: items.filter((item) => item.status === "new").length,
    changed: items.filter((item) => item.status === "changed").length,
    known: items.filter((item) => item.status === "known").length,
    resolved: resolvedItems.length,
    newReview: items.filter((item) => item.status === "new" && item.priority === "review").length,
    changedReview: items.filter((item) => item.status === "changed" && item.priority === "review").length,
    deltaReview: items.filter((item) => (item.status === "new" || item.status === "changed") && item.priority === "review").length,
    anyDelta: items.filter((item) => item.status === "new" || item.status === "changed").length + resolvedItems.length,
    byStatus: {
      new: items.filter((item) => item.status === "new").length,
      changed: items.filter((item) => item.status === "changed").length,
      known: items.filter((item) => item.status === "known").length,
      resolved: resolvedItems.length,
    },
  };

  const nextState: RulemeterState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    queueSchemaVersion: queueReport.schemaVersion,
    updatedAt: generatedAt,
    items: items.map(stateItemFromRunItem),
  };

  return {
    report: {
      schemaVersion: RUN_SCHEMA_VERSION,
      stateSchemaVersion: STATE_SCHEMA_VERSION,
      queueSchemaVersion: queueReport.schemaVersion,
      statePath: options.statePath ?? DEFAULT_STATE_PATH,
      stateUpdated: Boolean(options.updateState),
      generatedAt,
      files: queueReport.files,
      configPath: queueReport.configPath,
      preset: queueReport.preset,
      discoveredFiles: queueReport.discoveredFiles,
      ledgerPath: queueReport.ledgerPath,
      counts,
      items,
      resolvedItems,
    },
    nextState,
  };
}

export function runFailOnMatched(report: RunReport, failOn: RunFailOn | null): boolean {
  if (!failOn) return false;
  if (failOn === "new-review") return report.counts.newReview > 0;
  if (failOn === "changed-review") return report.counts.changedReview > 0;
  if (failOn === "delta-review") return report.counts.deltaReview > 0;
  return report.counts.anyDelta > 0;
}
