const translations = {
  en: {
    "nav.workflow": "Workflow",
    "nav.signals": "Signals",
    "nav.evidence": "Evidence",
    "nav.install": "Install",
    "hero.title": "Review agent rules without pretending the lint is exhaustive.",
    "hero.body":
      "RuleMeter is a report-only review aid for agent instruction drift, same-file duplicates, keyword-based risk findings, and optional near-duplicate review prompts.",
    "hero.primary": "View on GitHub",
    "hero.secondary": "Try locally",
    "workflow.title": "Report first, rewrite never.",
    "workflow.body":
      "RuleMeter does not edit files. It gives maintainers evidence for cross-file drift, same-file repetition, and what deserves review, while documenting that keyword risk findings are not safety guarantees.",
    "workflow.step1.title": "Discover instruction files",
    "workflow.step1.body": "Use presets for Codex, Claude, Copilot, Antigravity, or all known agent surfaces.",
    "workflow.step2.title": "Review exact duplicates",
    "workflow.step2.body": "Find normalized repeated instruction text without rewriting source files.",
    "workflow.step3.title": "Keep risky rules explicit",
    "workflow.step3.body": "Surface keyword matches for human review, with known blind spots documented.",
    "signals.title": "What the report separates",
    "signals.duplicates.title": "Duplicates and overlaps",
    "signals.duplicates.body": "Separates same-file removal candidates from cross-file drift or parity prompts.",
    "signals.risk.title": "High-risk rules",
    "signals.risk.body": "Flags keyword matches for review, not exhaustive safety coverage.",
    "signals.similar.title": "Similar candidates",
    "signals.similar.body": "Optional lexical-overlap review prompts, never automatic semantic dedupe.",
    "signals.ci.title": "CI tripwires",
    "signals.ci.body": "Fail on same-file duplicate removals, risk findings, or experimental similar-rule findings.",
    "evidence.title": "Evidence before product claims.",
    "evidence.body":
      "A private real-instruction corpus currently supports the internal-helper path, not a standalone public product claim.",
    "evidence.verdict.label": "Current verdict",
    "evidence.verdict.value": "Internal-helper ready; standalone deferred.",
    "evidence.verdict.body": "The standalone gate still fails because the real corpus produced no same-file duplicate signal.",
    "evidence.docs.label": "Corpus",
    "evidence.docs.value": "67 docs / 53 roots / 13 holdout",
    "evidence.surface.label": "Surface overlap usefulness",
    "evidence.risk.label": "Risk-summary usefulness",
    "evidence.duplicate.label": "Same-file duplicate signal",
    "evidence.duplicate.value": "0 findings",
    "evidence.load.label": "Review load",
    "evidence.riskload.label": "Risk load",
    "install.title": "Validate locally before standalone claims.",
    "install.body":
      "The current release path is npm-deferred: clone, pack, install-smoke, and run audits locally while the package surface stays testable.",
    "install.checklist": "Read the release checklist",
    "footer.status": "Lab status: internal-helper evidence is positive; standalone release is deferred.",
  },
  ko: {
    "nav.workflow": "흐름",
    "nav.signals": "신호",
    "nav.evidence": "근거",
    "nav.install": "설치",
    "hero.title": "lint가 완전하다고 꾸미지 않고 에이전트 규칙을 검토하세요.",
    "hero.body":
      "RuleMeter는 에이전트 지시문 drift, 같은 파일 내부 중복, 키워드 기반 위험 신호, 선택형 유사 규칙 후보를 보여주는 report-only review aid입니다.",
    "hero.primary": "GitHub에서 보기",
    "hero.secondary": "로컬에서 실행",
    "workflow.title": "먼저 리포트하고, 파일은 고치지 않습니다.",
    "workflow.body":
      "RuleMeter는 파일을 수정하지 않습니다. cross-file drift, 같은 파일 내부 반복, 사람이 봐야 하는 신호를 보여주되 키워드 위험 신호가 안전 보증은 아님을 명시합니다.",
    "workflow.step1.title": "지시문 파일 찾기",
    "workflow.step1.body": "Codex, Claude, Copilot, Antigravity 또는 알려진 모든 에이전트 표면을 preset으로 탐색합니다.",
    "workflow.step2.title": "정확한 중복 검토",
    "workflow.step2.body": "원본 파일을 고치지 않고 정규화된 반복 지시문을 찾습니다.",
    "workflow.step3.title": "위험한 규칙은 명시적으로 유지",
    "workflow.step3.body": "알려진 blind spot을 문서화한 상태에서 키워드 매치를 사람 검토용으로 표시합니다.",
    "signals.title": "리포트가 구분하는 것",
    "signals.duplicates.title": "중복과 overlap",
    "signals.duplicates.body": "같은 파일 내부 삭제 후보와 cross-file drift/parity 검토 신호를 구분합니다.",
    "signals.risk.title": "고위험 규칙",
    "signals.risk.body": "완전한 안전 커버리지가 아니라 검토용 키워드 매치를 표시합니다.",
    "signals.similar.title": "유사 후보",
    "signals.similar.body": "선택형 lexical-overlap 리뷰 신호이며, 자동 의미 중복 제거가 아닙니다.",
    "signals.ci.title": "CI 트립와이어",
    "signals.ci.body": "같은 파일 내부 삭제 후보, 위험 신호, 실험적 유사 규칙 발견을 기준으로 실패시킬 수 있습니다.",
    "evidence.title": "제품 주장보다 근거가 먼저입니다.",
    "evidence.body":
      "현재 private real-instruction corpus는 독립 공개 제품 주장이 아니라 internal-helper 경로를 뒷받침합니다.",
    "evidence.verdict.label": "현재 판정",
    "evidence.verdict.value": "Internal-helper는 가능하고, standalone은 보류입니다.",
    "evidence.verdict.body": "실제 corpus에서 같은 파일 내부 duplicate 신호가 0개라 standalone gate는 아직 실패합니다.",
    "evidence.docs.label": "Corpus",
    "evidence.docs.value": "문서 67개 / root 53개 / holdout 13개",
    "evidence.surface.label": "Surface overlap 유용성",
    "evidence.risk.label": "Risk-summary 유용성",
    "evidence.duplicate.label": "같은 파일 내부 duplicate 신호",
    "evidence.duplicate.value": "0건",
    "evidence.load.label": "리뷰 부하",
    "evidence.riskload.label": "Risk 부하",
    "install.title": "Standalone 주장 전에 로컬에서 검증하세요.",
    "install.body":
      "현재 릴리스 경로는 npm deferred입니다. clone, pack, install-smoke, local audit로 패키지 표면을 계속 검증 가능한 상태로 유지합니다.",
    "install.checklist": "릴리스 체크리스트 보기",
    "footer.status": "Lab 상태: internal-helper 근거는 긍정적이고, standalone release는 보류입니다.",
  },
  ja: {
    "nav.workflow": "流れ",
    "nav.signals": "シグナル",
    "nav.evidence": "根拠",
    "nav.install": "導入",
    "hero.title": "lint が完全だと装わずに、エージェント規則を確認します。",
    "hero.body":
      "RuleMeter は、エージェント指示の drift、同一ファイル内の重複、キーワードベースのリスク所見、任意の類似規則候補を示す report-only review aid です。",
    "hero.primary": "GitHub を見る",
    "hero.secondary": "ローカルで試す",
    "workflow.title": "まず報告し、書き換えません。",
    "workflow.body":
      "RuleMeter はファイルを編集しません。cross-file drift、同一ファイル内の反復、人が見るべきシグナルを示しつつ、キーワード所見が安全保証ではないことを明示します。",
    "workflow.step1.title": "指示ファイルを発見",
    "workflow.step1.body": "Codex、Claude、Copilot、Antigravity、または既知の全エージェント面を preset で探索します。",
    "workflow.step2.title": "完全重複を確認",
    "workflow.step2.body": "元ファイルを書き換えず、正規化された繰り返し指示文を見つけます。",
    "workflow.step3.title": "危険な規則は明示的に保持",
    "workflow.step3.body": "既知の blind spot を明記したうえで、キーワード一致を人のレビュー用に表示します。",
    "signals.title": "レポートが分けるもの",
    "signals.duplicates.title": "重複と overlap",
    "signals.duplicates.body": "同一ファイル内の削除候補と cross-file drift/parity の確認シグナルを分けます。",
    "signals.risk.title": "高リスク規則",
    "signals.risk.body": "網羅的な安全カバレッジではなく、レビュー用のキーワード一致を表示します。",
    "signals.similar.title": "類似候補",
    "signals.similar.body": "任意の lexical-overlap レビュー候補であり、自動の意味的 dedupe ではありません。",
    "signals.ci.title": "CI トリップワイヤー",
    "signals.ci.body": "同一ファイル内の削除候補、リスク所見、実験的な類似規則の検出で失敗させられます。",
    "evidence.title": "製品主張の前に根拠を置きます。",
    "evidence.body":
      "現在の private real-instruction corpus は、standalone 公開製品ではなく internal-helper の経路を支持しています。",
    "evidence.verdict.label": "現在の判定",
    "evidence.verdict.value": "Internal-helper ready; standalone deferred.",
    "evidence.verdict.body": "実 corpus で同一ファイル内 duplicate シグナルが 0 件だったため、standalone gate はまだ失敗します。",
    "evidence.docs.label": "Corpus",
    "evidence.docs.value": "67 docs / 53 roots / 13 holdout",
    "evidence.surface.label": "Surface overlap usefulness",
    "evidence.risk.label": "Risk-summary usefulness",
    "evidence.duplicate.label": "Same-file duplicate signal",
    "evidence.duplicate.value": "0 findings",
    "evidence.load.label": "Review load",
    "evidence.riskload.label": "Risk load",
    "install.title": "Standalone 主張の前にローカル検証します。",
    "install.body":
      "現在のリリース経路は npm deferred です。clone、pack、install-smoke、local audit で package surface を検証可能な状態に保ちます。",
    "install.checklist": "リリース checklist を読む",
    "footer.status": "Lab status: internal-helper evidence is positive; standalone release is deferred.",
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
