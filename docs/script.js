const translations = {
  en: {
    "nav.workflow": "Workflow",
    "nav.signals": "Signals",
    "nav.install": "Install",
    "hero.title": "Audit repeated agent rules before compression gets risky.",
    "hero.body":
      "RuleMeter is a report-only CLI for checking duplicated instruction text, alias break-even, token cost, cache-prefix suitability, and high-risk rules that should stay explicit.",
    "hero.primary": "View on GitHub",
    "hero.secondary": "Try locally",
    "workflow.title": "Report first, rewrite never.",
    "workflow.body":
      "RuleMeter does not edit files. It gives maintainers evidence for what is duplicated, what can be removed, and what should remain explicit because it protects identity, approvals, tests, logs, or security.",
    "workflow.step1.title": "Discover instruction files",
    "workflow.step1.body": "Use presets for Codex, Claude, Copilot, Antigravity, or all known agent surfaces.",
    "workflow.step2.title": "Measure token economics",
    "workflow.step2.body": "Compare raw text, alias cost, legend cost, break-even, and duplicate deletion savings.",
    "workflow.step3.title": "Keep risky rules explicit",
    "workflow.step3.body": "Flag sensitive instruction families so safety-critical rules are not compressed away.",
    "signals.title": "What the report separates",
    "signals.duplicates.title": "Exact duplicates",
    "signals.duplicates.body": "Shows when deleting repeated text beats introducing an alias.",
    "signals.risk.title": "High-risk rules",
    "signals.risk.body": "Keeps identity, PII, approval, test, log, and security rules visible.",
    "signals.similar.title": "Similar candidates",
    "signals.similar.body": "Optional lexical-overlap review prompts, never automatic semantic dedupe.",
    "signals.ci.title": "CI gates",
    "signals.ci.body": "Fail on duplicates, risks, candidates, or experimental similar-rule findings.",
    "install.title": "Use it before publishing pressure.",
    "install.body":
      "The current release path is npm-deferred: clone, pack, install-smoke, and run audits locally while the package surface stays publish-ready.",
    "footer.status": "Lab status: standalone validation before possible absorption into create-starter.",
  },
  ko: {
    "nav.workflow": "흐름",
    "nav.signals": "신호",
    "nav.install": "설치",
    "hero.title": "압축이 위험해지기 전에 반복되는 에이전트 규칙을 검토하세요.",
    "hero.body":
      "RuleMeter는 중복 지시문, alias 손익분기점, 토큰 비용, cache-prefix 적합성, 그리고 명시적으로 남겨야 할 고위험 규칙을 확인하는 report-only CLI입니다.",
    "hero.primary": "GitHub에서 보기",
    "hero.secondary": "로컬에서 실행",
    "workflow.title": "먼저 리포트하고, 파일은 고치지 않습니다.",
    "workflow.body":
      "RuleMeter는 파일을 수정하지 않습니다. 무엇이 중복인지, 무엇을 삭제할 수 있는지, 정체성·승인·테스트·로그·보안 때문에 무엇을 명시적으로 남겨야 하는지 근거를 제공합니다.",
    "workflow.step1.title": "지시문 파일 찾기",
    "workflow.step1.body": "Codex, Claude, Copilot, Antigravity 또는 알려진 모든 에이전트 표면을 preset으로 탐색합니다.",
    "workflow.step2.title": "토큰 경제성 측정",
    "workflow.step2.body": "원문, alias 비용, legend 비용, 손익분기점, 중복 삭제 절감량을 비교합니다.",
    "workflow.step3.title": "위험한 규칙은 명시적으로 유지",
    "workflow.step3.body": "안전상 중요한 규칙이 압축 과정에서 사라지지 않도록 민감한 지시문 계열을 표시합니다.",
    "signals.title": "리포트가 구분하는 것",
    "signals.duplicates.title": "정확한 중복",
    "signals.duplicates.body": "반복 문구를 삭제하는 편이 alias보다 나은 경우를 보여줍니다.",
    "signals.risk.title": "고위험 규칙",
    "signals.risk.body": "정체성, PII, 승인, 테스트, 로그, 보안 규칙을 눈에 보이게 유지합니다.",
    "signals.similar.title": "유사 후보",
    "signals.similar.body": "선택형 lexical-overlap 리뷰 신호이며, 자동 의미 중복 제거가 아닙니다.",
    "signals.ci.title": "CI 게이트",
    "signals.ci.body": "중복, 위험, 후보, 실험적 유사 규칙 발견을 기준으로 실패시킬 수 있습니다.",
    "install.title": "배포 압박 전에 먼저 사용하세요.",
    "install.body":
      "현재 릴리스 경로는 npm deferred입니다. clone, pack, install-smoke, local audit로 패키지 표면을 publish-ready 상태로 유지합니다.",
    "footer.status": "Lab 상태: create-starter 흡수 가능성 전 standalone 검증 단계입니다.",
  },
  ja: {
    "nav.workflow": "流れ",
    "nav.signals": "シグナル",
    "nav.install": "導入",
    "hero.title": "圧縮が危険になる前に、繰り返しのエージェント規則を監査します。",
    "hero.body":
      "RuleMeter は、重複した指示文、alias の損益分岐点、トークンコスト、cache-prefix の適性、明示的に残すべき高リスク規則を確認する report-only CLI です。",
    "hero.primary": "GitHub を見る",
    "hero.secondary": "ローカルで試す",
    "workflow.title": "まず報告し、書き換えません。",
    "workflow.body":
      "RuleMeter はファイルを編集しません。何が重複し、何を削除でき、ID・承認・テスト・ログ・セキュリティのために何を明示的に残すべきかを示します。",
    "workflow.step1.title": "指示ファイルを発見",
    "workflow.step1.body": "Codex、Claude、Copilot、Antigravity、または既知の全エージェント面を preset で探索します。",
    "workflow.step2.title": "トークン経済性を測定",
    "workflow.step2.body": "原文、alias コスト、legend コスト、損益分岐点、重複削除の節約量を比較します。",
    "workflow.step3.title": "危険な規則は明示的に保持",
    "workflow.step3.body": "安全上重要な規則が圧縮で消えないよう、敏感な指示ファミリーを表示します。",
    "signals.title": "レポートが分けるもの",
    "signals.duplicates.title": "完全重複",
    "signals.duplicates.body": "繰り返し文を削除する方が alias より有利な場合を示します。",
    "signals.risk.title": "高リスク規則",
    "signals.risk.body": "ID、PII、承認、テスト、ログ、セキュリティ規則を見える状態に保ちます。",
    "signals.similar.title": "類似候補",
    "signals.similar.body": "任意の lexical-overlap レビュー候補であり、自動の意味的 dedupe ではありません。",
    "signals.ci.title": "CI ゲート",
    "signals.ci.body": "重複、リスク、候補、実験的な類似規則の検出で失敗させられます。",
    "install.title": "公開の圧力が来る前に使えます。",
    "install.body":
      "現在のリリース経路は npm deferred です。clone、pack、install-smoke、local audit で package surface を publish-ready に保ちます。",
    "footer.status": "Lab status: create-starter への吸収前の standalone 検証段階です。",
  },
};

const supportedLanguages = Object.keys(translations);
const languageButtons = document.querySelectorAll("[data-lang]");
const translatableNodes = document.querySelectorAll("[data-i18n]");

function preferredLanguage() {
  const params = new URLSearchParams(window.location.search);
  const queryLanguage = params.get("lang");
  if (queryLanguage && supportedLanguages.includes(queryLanguage)) return queryLanguage;

  const storedLanguage = window.localStorage.getItem("rulemeter-language");
  if (storedLanguage && supportedLanguages.includes(storedLanguage)) return storedLanguage;

  const browserLanguage = navigator.language.slice(0, 2);
  return supportedLanguages.includes(browserLanguage) ? browserLanguage : "en";
}

function setLanguage(language) {
  const dictionary = translations[language] ?? translations.en;
  document.documentElement.lang = language;
  translatableNodes.forEach((node) => {
    const key = node.dataset.i18n;
    if (dictionary[key]) node.textContent = dictionary[key];
  });
  languageButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.lang === language));
  });
  window.localStorage.setItem("rulemeter-language", language);
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const language = button.dataset.lang;
    if (supportedLanguages.includes(language)) setLanguage(language);
  });
});

setLanguage(preferredLanguage());
