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
  type RuleCandidate,
  type SimilarRecommendation,
  type SimilarRuleCandidate,
} from "./audit.js";
export { loadRulemeterConfig, loadRulemeterConfigWithMeta, type LoadedRulemeterConfig, type RulemeterConfig } from "./config.js";
export { RulemeterError } from "./errors.js";
export { formatAuditMarkdown, formatAuditTable } from "./format.js";
export { discoverPresetFiles, presetNames, type PresetName } from "./presets.js";
export { classifyRisks, highRiskLabels, isHighRisk, riskRules, type RiskLabel } from "./risk.js";
export { AUDIT_SCHEMA_VERSION, DISCOVERY_SCHEMA_VERSION, ERROR_SCHEMA_VERSION, type RulemeterWarning } from "./schema.js";
