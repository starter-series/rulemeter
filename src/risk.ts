export interface RiskRule {
  label: RiskLabel;
  patterns: RegExp[];
}

export type RiskLabel =
  | "identity"
  | "pii"
  | "approval_required"
  | "test_required"
  | "strategy_requires_ratification"
  | "logs_or_errors"
  | "security_policy";

export const highRiskLabels = new Set<RiskLabel>([
  "identity",
  "pii",
  "approval_required",
  "test_required",
  "strategy_requires_ratification",
  "logs_or_errors",
  "security_policy",
]);

export const riskRules: RiskRule[] = [
  {
    label: "identity",
    patterns: [
      /\bpublic identity\b/i,
      /\bidentity\b/i,
      /\bHeznpc\b/i,
      /\bcommit author\b/i,
      /\bsole author\b/i,
      /\bCo-Authored-By\b/i,
      /\bexternal surface\b/i,
      /정체성|실명|공개\s*이름|커밋\s*작성자/u,
    ],
  },
  {
    label: "pii",
    patterns: [
      /\bPII\b/i,
      /\bemail\s+(?:address|account|header|recipient)\b/i,
      /\bAPI key\b/i,
      /\b(?:api|access|auth|bearer|secret)\s+token\b/i,
      /\baccount identifier\b/i,
      /\breference number\b/i,
      /개인정보|이메일\s*(?:주소|계정)?|계정\s*식별자|토큰|API\s*키|시크릿|식별자/u,
    ],
  },
  {
    label: "approval_required",
    patterns: [
      /\bapproval\b/i,
      /\bask before\b/i,
      /\bforce push\b/i,
      /\bhard reset\b/i,
      /\bbranch -D\b/i,
      /\bbroad scan\b/i,
      /승인|묻고|물어보고|광범위\s*스캔|강제\s*푸시|하드\s*리셋/u,
    ],
  },
  {
    label: "test_required",
    patterns: [
      /\bnpm\s+test\b/i,
      /\bpytest\b/i,
      /\b(?:actually\s+run|run|rerun|execute)\s+(?:the\s+)?(?:unit\s+|integration\s+|e2e\s+)?tests?\b/i,
      /\b(?:CI|continuous integration)\s+(?:gate|check|status|workflow|run|pass|green)\b/i,
      /\bverification command\b/i,
      /테스트|검증/u,
    ],
  },
  {
    label: "strategy_requires_ratification",
    patterns: [
      /\bratification\b/i,
      /\bowner stated\b/i,
      /\bnew strategy\b/i,
      /\bstrategy\s+(?:text|choice|constraint|requires|enters)\b/i,
      /\bpositioning\b/i,
      /\bKPI\b/i,
      /\bconstraint\s+text\b/i,
      /전략|포지셔닝|제약|소유자|확정/u,
    ],
  },
  {
    label: "logs_or_errors",
    patterns: [
      /\b(?:logs?|errors?)\b.*\b(?:compress|redact|report|excerpt|output|stack trace|stderr|stdout|build output)\b/i,
      /\b(?:compress|redact|report)\b.*\b(?:logs?|errors?)\b/i,
      /\berror\s+(?:message|log|output|trace|handling|report|excerpt)s?\b/i,
      /\btraceback\b/i,
      /\bstack trace\b/i,
      /\bstderr\b/i,
      /\bstdout\b/i,
      /\bbuild output\b/i,
      /로그|에러|오류|스택\s*트레이스|빌드\s*출력/u,
    ],
  },
  {
    label: "security_policy",
    patterns: [
      /\bsecurity\s+(?:policy|advisory|review|gate|rule|rules|permission|permissions|boundary|requirement|requirements|note|notes)\b/i,
      /\bCVE\b/i,
      /\bvulnerability\b/i,
      /\bsecrets?\b/i,
      /\b(?:sandbox|filesystem|network|approval)\s+permissions?\b/i,
      /보안|취약점|권한\s*(?:정책|승인|상승)|시크릿/u,
    ],
  },
];

export function classifyRisks(text: string): RiskLabel[] {
  const labels: RiskLabel[] = [];
  for (const rule of riskRules) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      labels.push(rule.label);
    }
  }
  return labels;
}

export function isHighRisk(labels: RiskLabel[]): boolean {
  return labels.some((label) => highRiskLabels.has(label));
}
