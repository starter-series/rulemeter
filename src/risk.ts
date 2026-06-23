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
      /\bauthor\b/i,
      /\bCo-Authored-By\b/i,
      /\bexternal surface\b/i,
      /정체성|실명|공개\s*이름|작성자/u,
    ],
  },
  {
    label: "pii",
    patterns: [
      /\bPII\b/i,
      /\bemail\b/i,
      /\bAPI key\b/i,
      /\btoken\b/i,
      /\baccount identifier\b/i,
      /\breference number\b/i,
      /개인정보|이메일|계정|토큰|키|식별자/u,
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
    patterns: [/\btest\b/i, /\btests\b/i, /\bpytest\b/i, /\bnpm test\b/i, /\bCI\b/i, /테스트|검증/u],
  },
  {
    label: "strategy_requires_ratification",
    patterns: [
      /\bratification\b/i,
      /\bowner stated\b/i,
      /\bstrategy\b/i,
      /\bpositioning\b/i,
      /\bKPI\b/i,
      /\bconstraint\b/i,
      /전략|포지셔닝|제약|소유자|확정/u,
    ],
  },
  {
    label: "logs_or_errors",
    patterns: [
      /\blog\b/i,
      /\blogs\b/i,
      /\berror\b/i,
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
    patterns: [/\bsecurity\b/i, /\bCVE\b/i, /\bvulnerability\b/i, /\bsecret\b/i, /\bpermission\b/i, /보안|취약점|권한|시크릿/u],
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

