export {
  auditDocuments,
  auditRules,
  extractSegments,
  normalizeSegment,
  type AuditDocument,
  type AuditOptions,
  type AuditReport,
  type CacheHint,
  type Occurrence,
  type Recommendation,
  type RiskFinding,
  type RiskSummary,
  type RiskSummaryExample,
  type RuleCandidate,
  type SimilarRecommendation,
  type SimilarRuleCandidate,
  type SurfaceOverlap,
  type SurfaceOverlapExample,
  type SurfaceOverlapRecommendation,
} from "./audit.js";
export { loadRulemeterConfig, loadRulemeterConfigWithMeta, type LoadedRulemeterConfig, type RulemeterConfig } from "./config.js";
export {
  acceptSourceDecisions,
  DEFAULT_DECISION_LEDGER_PATH,
  decisionReportForSources,
  loadDecisionLedger,
  writeDecisionLedger,
  type DecisionItem,
  type DecisionKind,
  type DecisionLedger,
  type DecisionLedgerEntry,
  type DecisionReport,
  type DecisionStatus,
} from "./decisions.js";
export { RulemeterError } from "./errors.js";
export {
  formatAuditMarkdown,
  formatAuditTable,
  formatDecisionsMarkdown,
  formatDecisionsTable,
  formatSourcesMarkdown,
  formatSourcesTable,
} from "./format.js";
export { discoverPresetFiles, presetNames, type PresetName } from "./presets.js";
export { classifyRisks, highRiskLabels, isHighRisk, riskRules, type RiskLabel } from "./risk.js";
export {
  analyzeInstructionSources,
  type SourceFile,
  type SourceImportReference,
  type SourceReport,
  type SourceRole,
  type SourceStrategy,
} from "./sources.js";
export {
  AUDIT_SCHEMA_VERSION,
  DECISIONS_SCHEMA_VERSION,
  DISCOVERY_SCHEMA_VERSION,
  ERROR_SCHEMA_VERSION,
  SOURCES_SCHEMA_VERSION,
  type RulemeterWarning,
} from "./schema.js";
