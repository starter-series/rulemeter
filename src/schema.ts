export const AUDIT_SCHEMA_VERSION = "rulemeter.audit.v2";
export const DISCOVERY_SCHEMA_VERSION = "rulemeter.discovery.v1";
export const DECISIONS_SCHEMA_VERSION = "rulemeter.decisions.v1";
export const ERROR_SCHEMA_VERSION = "rulemeter.error.v1";
export const QUEUE_SCHEMA_VERSION = "rulemeter.queue.v1";
export const RUN_SCHEMA_VERSION = "rulemeter.run.v1";
export const SOURCES_SCHEMA_VERSION = "rulemeter.sources.v2";
export const STATE_SCHEMA_VERSION = "rulemeter.state.v1";

export interface RulemeterWarning {
  code: string;
  message: string;
}
