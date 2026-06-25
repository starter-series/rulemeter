export const AUDIT_SCHEMA_VERSION = "rulemeter.audit.v2";
export const DISCOVERY_SCHEMA_VERSION = "rulemeter.discovery.v1";
export const ERROR_SCHEMA_VERSION = "rulemeter.error.v1";

export interface RulemeterWarning {
  code: string;
  message: string;
}
