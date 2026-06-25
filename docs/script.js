const translations = {
  en: {
    "nav.workflow": "Workflow",
    "nav.signals": "Signals",
    "nav.install": "Install",
    "hero.title": "Review agent rules without pretending the lint is exhaustive.",
    "hero.body":
      "RuleMeter is a report-only advisory lint for duplicated instruction text, keyword-based risk findings, and optional near-duplicate review prompts.",
    "hero.primary": "View on GitHub",
    "hero.secondary": "Try locally",
    "workflow.title": "Report first, rewrite never.",
    "workflow.body":
      "RuleMeter does not edit files. It gives maintainers evidence for what is duplicated, what can be removed, and what deserves review, while documenting that keyword risk findings are not safety guarantees.",
    "workflow.step1.title": "Discover instruction files",
    "workflow.step1.body": "Use presets for Codex, Claude, Copilot, Antigravity, or all known agent surfaces.",
    "workflow.step2.title": "Review exact duplicates",
    "workflow.step2.body": "Find normalized repeated instruction text without rewriting source files.",
    "workflow.step3.title": "Keep risky rules explicit",
    "workflow.step3.body": "Surface keyword matches for human review, with known blind spots documented.",
    "signals.title": "What the report separates",
    "signals.duplicates.title": "Exact duplicates",
    "signals.duplicates.body": "Shows exact repeated text that may be safe to remove after review.",
    "signals.risk.title": "High-risk rules",
    "signals.risk.body": "Flags keyword matches for review, not exhaustive safety coverage.",
    "signals.similar.title": "Similar candidates",
    "signals.similar.body": "Optional lexical-overlap review prompts, never automatic semantic dedupe.",
    "signals.ci.title": "CI tripwires",
    "signals.ci.body": "Fail on duplicates, risk findings, or experimental similar-rule findings.",
    "install.title": "Use it before publishing pressure.",
    "install.body":
      "The current release path is npm-deferred: clone, pack, install-smoke, and run audits locally while the package surface stays publish-ready.",
    "footer.status": "Lab status: standalone validation before possible absorption into create-starter.",
  },
  ko: {
    "nav.workflow": "흐름",
    "nav.signals": "신호",
    "nav.install": "설치",
    "hero.title": "lint가 완전하다고 꾸미지 않고 에이전트 규칙을 검토하세요.",
    "hero.body":
      "RuleMeter는 중복 지시문, 키워드 기반 위험 신호, 선택형 유사 규칙 후보를 보여주는 report-only advisory lint입니다.",
    "hero.primary": "GitHub에서 보기",
    "hero.secondary": "로컬에서 실행",
    "workflow.title": "먼저 리포트하고, 파일은 고치지 않습니다.",
    "workflow.body":
      "RuleMeter는 파일을 수정하지 않습니다. 무엇이 중복인지, 무엇을 삭제 검토할 수 있는지, 무엇을 사람이 봐야 하는지 보여주되 키워드 위험 신호가 안전 보증은 아님을 명시합니다.",
    "workflow.step1.title": "지시문 파일 찾기",
    "workflow.step1.body": "Codex, Claude, Copilot, Antigravity 또는 알려진 모든 에이전트 표면을 preset으로 탐색합니다.",
    "workflow.step2.title": "정확한 중복 검토",
    "workflow.step2.body": "원본 파일을 고치지 않고 정규화된 반복 지시문을 찾습니다.",
    "workflow.step3.title": "위험한 규칙은 명시적으로 유지",
    "workflow.step3.body": "알려진 blind spot을 문서화한 상태에서 키워드 매치를 사람 검토용으로 표시합니다.",
    "signals.title": "리포트가 구분하는 것",
    "signals.duplicates.title": "정확한 중복",
    "signals.duplicates.body": "검토 후 삭제할 수 있는 정확한 반복 문구를 보여줍니다.",
    "signals.risk.title": "고위험 규칙",
    "signals.risk.body": "완전한 안전 커버리지가 아니라 검토용 키워드 매치를 표시합니다.",
    "signals.similar.title": "유사 후보",
    "signals.similar.body": "선택형 lexical-overlap 리뷰 신호이며, 자동 의미 중복 제거가 아닙니다.",
    "signals.ci.title": "CI 트립와이어",
    "signals.ci.body": "중복, 위험 신호, 실험적 유사 규칙 발견을 기준으로 실패시킬 수 있습니다.",
    "install.title": "배포 압박 전에 먼저 사용하세요.",
    "install.body":
      "현재 릴리스 경로는 npm deferred입니다. clone, pack, install-smoke, local audit로 패키지 표면을 publish-ready 상태로 유지합니다.",
    "footer.status": "Lab 상태: create-starter 흡수 가능성 전 standalone 검증 단계입니다.",
  },
  ja: {
    "nav.workflow": "流れ",
    "nav.signals": "シグナル",
    "nav.install": "導入",
    "hero.title": "lint が完全だと装わずに、エージェント規則を確認します。",
    "hero.body":
      "RuleMeter は、重複した指示文、キーワードベースのリスク所見、任意の類似規則候補を示す report-only advisory lint です。",
    "hero.primary": "GitHub を見る",
    "hero.secondary": "ローカルで試す",
    "workflow.title": "まず報告し、書き換えません。",
    "workflow.body":
      "RuleMeter はファイルを編集しません。何が重複し、何を削除検討でき、何を人が見るべきかを示しつつ、キーワード所見が安全保証ではないことを明示します。",
    "workflow.step1.title": "指示ファイルを発見",
    "workflow.step1.body": "Codex、Claude、Copilot、Antigravity、または既知の全エージェント面を preset で探索します。",
    "workflow.step2.title": "完全重複を確認",
    "workflow.step2.body": "元ファイルを書き換えず、正規化された繰り返し指示文を見つけます。",
    "workflow.step3.title": "危険な規則は明示的に保持",
    "workflow.step3.body": "既知の blind spot を明記したうえで、キーワード一致を人のレビュー用に表示します。",
    "signals.title": "レポートが分けるもの",
    "signals.duplicates.title": "完全重複",
    "signals.duplicates.body": "レビュー後に削除できる可能性がある完全一致の繰り返し文を示します。",
    "signals.risk.title": "高リスク規則",
    "signals.risk.body": "網羅的な安全カバレッジではなく、レビュー用のキーワード一致を表示します。",
    "signals.similar.title": "類似候補",
    "signals.similar.body": "任意の lexical-overlap レビュー候補であり、自動の意味的 dedupe ではありません。",
    "signals.ci.title": "CI トリップワイヤー",
    "signals.ci.body": "重複、リスク所見、実験的な類似規則の検出で失敗させられます。",
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
