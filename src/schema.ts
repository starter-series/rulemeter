export const AUDIT_SCHEMA_VERSION = "rulemeter.audit.v1";
export const COUNT_SCHEMA_VERSION = "rulemeter.count.v1";
export const DISCOVERY_SCHEMA_VERSION = "rulemeter.discovery.v1";
export const ERROR_SCHEMA_VERSION = "rulemeter.error.v1";

export interface RulemeterWarning {
  code: string;
  message: string;
}
