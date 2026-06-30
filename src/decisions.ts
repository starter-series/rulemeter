import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { RulemeterError } from "./errors.js";
import { DECISIONS_SCHEMA_VERSION } from "./schema.js";
import type { SourceFile, SourceReport } from "./sources.js";

export const DEFAULT_DECISION_LEDGER_PATH = ".rulemeter/decisions.json";

export type DecisionKind = "source_warning";
export type DecisionStatus = "pending" | "accepted" | "stale";

export interface DecisionLedgerEntry {
  id: string;
  key: string;
  kind: DecisionKind;
  signal: string;
  subject: string;
  target: string | null;
  evidenceHash: string;
  message: string;
  acceptedAt: string;
  note?: string;
}

export interface DecisionLedger {
  schemaVersion: typeof DECISIONS_SCHEMA_VERSION;
  decisions: DecisionLedgerEntry[];
}

export interface DecisionItem {
  id: string;
  key: string;
  kind: DecisionKind;
  signal: string;
  subject: string;
  target: string | null;
  evidenceHash: string;
  status: DecisionStatus;
  message: string;
  acceptedAt: string | null;
  note?: string;
  previousEvidenceHash?: string;
}

export interface DecisionReport {
  schemaVersion: typeof DECISIONS_SCHEMA_VERSION;
  ledgerPath: string;
  sourceSchemaVersion: SourceReport["schemaVersion"];
  sourceStrategy: SourceReport["sourceStrategy"];
  canonicalPath: string | null;
  counts: Record<DecisionStatus | "total", number>;
  items: DecisionItem[];
}

interface CurrentDecision {
  id: string;
  key: string;
  kind: DecisionKind;
  signal: string;
  subject: string;
  target: string | null;
  evidenceHash: string;
  message: string;
}

interface AcceptDecisionOptions {
  ledgerPath?: string;
  accept: string;
  note?: string;
  now?: Date;
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function shortHash(value: string, length = 16): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function fullHash(values: Array<string | null | undefined>): string {
  return createHash("sha256")
    .update(values.map((value) => value ?? "").join("\0"))
    .digest("hex");
}

function decisionKey(kind: DecisionKind, signal: string, subject: string, target: string | null): string {
  return [kind, signal, subject, target ?? ""].join("\0");
}

function decisionId(key: string): string {
  return `DEC_${shortHash(key, 12).toUpperCase()}`;
}

function canonicalFile(report: SourceReport): SourceFile | undefined {
  return report.files.find((file) => file.path === report.canonicalPath);
}

function sourceDecision(
  signal: string,
  subject: string,
  target: string | null,
  evidenceValues: Array<string | null | undefined>,
  message: string,
): CurrentDecision {
  const key = decisionKey("source_warning", signal, subject, target);
  return {
    id: decisionId(key),
    key,
    kind: "source_warning",
    signal,
    subject,
    target,
    evidenceHash: fullHash([signal, subject, target, ...evidenceValues]),
    message,
  };
}

function sourceDecisions(report: SourceReport): CurrentDecision[] {
  const decisions: CurrentDecision[] = [];
  const canonical = canonicalFile(report);

  for (const file of report.files) {
    if (file.role === "verbatim_mirror") {
      const target = file.byteIdenticalTo ?? report.canonicalPath;
      decisions.push(
        sourceDecision(
          "VERBATIM_MIRROR_NOT_LINKED",
          file.path,
          target,
          [file.role, file.sha256, target, canonical?.sha256],
          `${file.path} is byte-identical to ${target} but is not symlink/import-backed`,
        ),
      );
    }

    if (file.role === "local_override" && report.canonicalPath) {
      decisions.push(
        sourceDecision(
          "LOCAL_OVERRIDE",
          file.path,
          report.canonicalPath,
          [file.role, file.sha256, report.canonicalPath, canonical?.sha256],
          `${file.path} differs from ${report.canonicalPath}; confirm this override is intentional`,
        ),
      );
    }

    if (file.isSymlink && file.symlinkTarget && !report.files.some((candidate) => candidate.path === file.symlinkTarget)) {
      decisions.push(
        sourceDecision(
          "SYMLINK_TARGET_OUTSIDE_SCAN",
          file.path,
          file.symlinkTarget,
          [file.role, file.symlinkTarget, file.sha256],
          `${file.path} points to ${file.symlinkTarget}, which is outside the scanned instruction files`,
        ),
      );
    }

    for (const reference of file.imports) {
      if (!reference.existsInScan) {
        decisions.push(
          sourceDecision(
            "IMPORT_TARGET_OUTSIDE_SCAN",
            file.path,
            reference.path,
            [file.role, reference.specifier, reference.path, file.sha256],
            `${file.path} imports @${reference.specifier}, which is outside the scanned instruction files`,
          ),
        );
      }
    }
  }

  return decisions.sort((left, right) => left.id.localeCompare(right.id));
}

function emptyLedger(): DecisionLedger {
  return { schemaVersion: DECISIONS_SCHEMA_VERSION, decisions: [] };
}

function assertLedger(value: unknown, ledgerPath: string): DecisionLedger {
  if (!value || typeof value !== "object") {
    throw new RulemeterError("DECISION_LEDGER_INVALID", `${ledgerPath} must be a JSON object`);
  }
  const candidate = value as Partial<DecisionLedger>;
  if (candidate.schemaVersion !== DECISIONS_SCHEMA_VERSION) {
    throw new RulemeterError("DECISION_LEDGER_INVALID", `${ledgerPath} schemaVersion must be ${DECISIONS_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(candidate.decisions)) {
    throw new RulemeterError("DECISION_LEDGER_INVALID", `${ledgerPath} decisions must be an array`);
  }
  for (const decision of candidate.decisions) {
    if (
      !decision ||
      typeof decision !== "object" ||
      typeof decision.id !== "string" ||
      typeof decision.key !== "string" ||
      decision.kind !== "source_warning" ||
      typeof decision.signal !== "string" ||
      typeof decision.subject !== "string" ||
      (decision.target !== null && typeof decision.target !== "string") ||
      typeof decision.evidenceHash !== "string" ||
      typeof decision.message !== "string" ||
      typeof decision.acceptedAt !== "string"
    ) {
      throw new RulemeterError("DECISION_LEDGER_INVALID", `${ledgerPath} contains an invalid decision entry`);
    }
  }
  return candidate as DecisionLedger;
}

export async function loadDecisionLedger(ledgerPath = DEFAULT_DECISION_LEDGER_PATH): Promise<DecisionLedger> {
  try {
    const text = await readFile(ledgerPath, "utf8");
    try {
      return assertLedger(JSON.parse(text), ledgerPath);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new RulemeterError("DECISION_LEDGER_INVALID_JSON", `${ledgerPath} contains invalid JSON`);
      }
      throw error;
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return emptyLedger();
    throw error;
  }
}

export async function writeDecisionLedger(ledger: DecisionLedger, ledgerPath = DEFAULT_DECISION_LEDGER_PATH): Promise<void> {
  const normalizedPath = normalizePath(resolve(ledgerPath));
  await mkdir(dirname(normalizedPath), { recursive: true });
  const sorted = {
    schemaVersion: DECISIONS_SCHEMA_VERSION,
    decisions: [...ledger.decisions].sort((left, right) => left.id.localeCompare(right.id)),
  };
  await writeFile(normalizedPath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

export function decisionReportForSources(
  sourceReport: SourceReport,
  ledger: DecisionLedger = emptyLedger(),
  ledgerPath = DEFAULT_DECISION_LEDGER_PATH,
): DecisionReport {
  const byKey = new Map(ledger.decisions.map((decision) => [decision.key, decision]));
  const items: DecisionItem[] = sourceDecisions(sourceReport).map((current) => {
    const accepted = byKey.get(current.key);
    if (!accepted) return { ...current, status: "pending", acceptedAt: null };
    if (accepted.evidenceHash === current.evidenceHash) {
      return { ...current, status: "accepted", acceptedAt: accepted.acceptedAt, note: accepted.note };
    }
    return {
      ...current,
      status: "stale",
      acceptedAt: accepted.acceptedAt,
      note: accepted.note,
      previousEvidenceHash: accepted.evidenceHash,
    };
  });
  const counts = {
    total: items.length,
    pending: items.filter((item) => item.status === "pending").length,
    accepted: items.filter((item) => item.status === "accepted").length,
    stale: items.filter((item) => item.status === "stale").length,
  };
  return {
    schemaVersion: DECISIONS_SCHEMA_VERSION,
    ledgerPath,
    sourceSchemaVersion: sourceReport.schemaVersion,
    sourceStrategy: sourceReport.sourceStrategy,
    canonicalPath: sourceReport.canonicalPath,
    counts,
    items,
  };
}

export async function acceptSourceDecisions(sourceReport: SourceReport, options: AcceptDecisionOptions): Promise<DecisionReport> {
  const ledgerPath = options.ledgerPath ?? DEFAULT_DECISION_LEDGER_PATH;
  const ledger = await loadDecisionLedger(ledgerPath);
  const current = sourceDecisions(sourceReport);
  const currentById = new Map(current.flatMap((item) => [[item.id, item] as const, [item.key, item] as const]));
  const acceptedKeys = new Set<string>();
  const now = (options.now ?? new Date()).toISOString();

  if (options.accept === "all") {
    for (const item of current) acceptedKeys.add(item.key);
  } else {
    const item = currentById.get(options.accept);
    if (!item) throw new RulemeterError("DECISION_NOT_FOUND", `decision not found in current report: ${options.accept}`);
    acceptedKeys.add(item.key);
  }

  if (acceptedKeys.size === 0) return decisionReportForSources(sourceReport, ledger, ledgerPath);

  const existingByKey = new Map(ledger.decisions.map((decision) => [decision.key, decision]));
  for (const item of current) {
    if (!acceptedKeys.has(item.key)) continue;
    const previous = existingByKey.get(item.key);
    existingByKey.set(item.key, {
      id: item.id,
      key: item.key,
      kind: item.kind,
      signal: item.signal,
      subject: item.subject,
      target: item.target,
      evidenceHash: item.evidenceHash,
      message: item.message,
      acceptedAt: now,
      note: options.note || previous?.note,
    });
  }

  const nextLedger: DecisionLedger = { schemaVersion: DECISIONS_SCHEMA_VERSION, decisions: [...existingByKey.values()] };
  await writeDecisionLedger(nextLedger, ledgerPath);
  return decisionReportForSources(sourceReport, nextLedger, ledgerPath);
}
