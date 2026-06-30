const translations = {
  en: {
    "nav.workflow": "Workflow",
    "nav.signals": "Signals",
    "nav.evidence": "Evidence",
    "nav.install": "Install",
    "hero.title": "Review agent rules without pretending the lint is exhaustive.",
    "hero.body":
      "RuleMeter is a report-only review aid for same-file duplicate instructions, cross-file verbatim overlaps, source topology, and optional near-duplicate review prompts.",
    "hero.primary": "View on GitHub",
    "hero.secondary": "Try locally",
    "workflow.title": "Report first, rewrite never.",
    "workflow.body":
      "RuleMeter does not edit files. It gives maintainers evidence for cross-file verbatim overlap, same-file repetition, and what deserves review, while documenting that keyword hits are not coverage guarantees.",
    "workflow.step1.title": "Discover instruction files",
    "workflow.step1.body": "Use presets for Codex, Claude, Copilot, Antigravity, or all known agent surfaces.",
    "workflow.step2.title": "Check source topology",
    "workflow.step2.body": "Detect symlink, import, byte-identical mirror, and local override relationships without semantic guessing.",
    "workflow.step3.title": "Review exact duplicates",
    "workflow.step3.body": "Find normalized repeated instruction text without rewriting source files.",
    "workflow.step4.title": "Ratify intentional topology",
    "workflow.step4.body": "Store owner-approved topology decisions in a local ledger without editing instruction files.",
    "signals.title": "What the report separates",
    "signals.sources.title": "Source topology",
    "signals.sources.body": "Checks whether instruction files use a single source, symlink, import, mirror, or local override pattern.",
    "signals.duplicates.title": "Duplicates and overlaps",
    "signals.duplicates.body": "Separates same-file removal candidates from cross-file parity or consolidation prompts.",
    "signals.risk.title": "Keyword review hits",
    "signals.risk.body": "Flags keyword matches for human review, not classification or coverage.",
    "signals.similar.title": "Similar candidates",
    "signals.similar.body": "Optional lexical-overlap review prompts, never automatic semantic dedupe.",
    "signals.decisions.title": "Decision ledger",
    "signals.decisions.body": "Remembers owner-accepted topology warnings and marks them stale when evidence changes.",
    "signals.ci.title": "CI tripwires",
    "signals.ci.body": "Fail on same-file duplicate removals, risk findings, similar-rule findings, or unaccepted decisions.",
    "evidence.title": "Evidence before product claims.",
    "evidence.body":
      "A private real-instruction corpus currently supports the internal-helper path, not a standalone public product claim.",
    "evidence.verdict.label": "Current verdict",
    "evidence.verdict.value": "Internal-helper ready; standalone deferred.",
    "evidence.verdict.body": "The standalone gate still fails because the real corpus produced no same-file duplicate signal.",
    "evidence.docs.label": "Public corpus",
    "evidence.docs.value": "3 fixture docs, smoke only",
    "evidence.private.label": "Private validation",
    "evidence.private.value": "owner-held snapshot; not public proof",
    "evidence.release.label": "Standalone release",
    "evidence.release.value": "deferred until strict corpus passes",
    "evidence.risk.label": "Risk model",
    "evidence.risk.value": "keyword-based and non-exhaustive",
    "evidence.ci.label": "CI corpus check",
    "evidence.ci.value": "non-strict smoke against fixture corpus",
    "evidence.next.label": "Decision path",
    "evidence.next.value": "release checklist before publish or absorption",
    "install.title": "Validate locally before standalone claims.",
    "install.body":
      "The current release path is npm-deferred: clone, verify locally, and run audits while the package surface stays testable.",
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
      "RuleMeter는 같은 파일 내부 중복 지시문, 파일 간 축자 overlap, source topology, 선택형 유사 규칙 후보를 보여주는 report-only review aid입니다.",
    "hero.primary": "GitHub에서 보기",
    "hero.secondary": "로컬에서 실행",
    "workflow.title": "먼저 리포트하고, 파일은 고치지 않습니다.",
    "workflow.body":
      "RuleMeter는 파일을 수정하지 않습니다. 파일 간 축자 overlap, 같은 파일 내부 반복, 사람이 봐야 하는 신호를 보여주되 키워드 hit가 커버리지 보증은 아님을 명시합니다.",
    "workflow.step1.title": "지시문 파일 찾기",
    "workflow.step1.body": "Codex, Claude, Copilot, Antigravity 또는 알려진 모든 에이전트 표면을 preset으로 탐색합니다.",
    "workflow.step2.title": "Source topology 확인",
    "workflow.step2.body": "semantic 추측 없이 symlink, import, byte-identical mirror, local override 관계를 감지합니다.",
    "workflow.step3.title": "정확한 중복 검토",
    "workflow.step3.body": "원본 파일을 고치지 않고 정규화된 반복 지시문을 찾습니다.",
    "workflow.step4.title": "의도된 topology 승인",
    "workflow.step4.body": "원본 지시문 파일을 고치지 않고 owner가 승인한 topology 결정을 로컬 ledger에 저장합니다.",
    "signals.title": "리포트가 구분하는 것",
    "signals.sources.title": "Source topology",
    "signals.sources.body": "지시문 파일이 single source, symlink, import, mirror, local override 패턴 중 무엇인지 확인합니다.",
    "signals.duplicates.title": "중복과 overlap",
    "signals.duplicates.body": "같은 파일 내부 삭제 후보와 파일 간 parity/consolidation 검토 신호를 구분합니다.",
    "signals.risk.title": "키워드 검토 hit",
    "signals.risk.body": "분류나 커버리지 보증이 아니라 사람이 검토할 키워드 매치를 표시합니다.",
    "signals.similar.title": "유사 후보",
    "signals.similar.body": "선택형 lexical-overlap 리뷰 신호이며, 자동 의미 중복 제거가 아닙니다.",
    "signals.decisions.title": "Decision ledger",
    "signals.decisions.body": "owner가 승인한 topology 경고를 기억하고 증거가 바뀌면 stale로 표시합니다.",
    "signals.ci.title": "CI 트립와이어",
    "signals.ci.body": "같은 파일 내부 삭제 후보, 위험 신호, 유사 규칙 발견, 미승인 결정을 기준으로 실패시킬 수 있습니다.",
    "evidence.title": "제품 주장보다 근거가 먼저입니다.",
    "evidence.body":
      "현재 private real-instruction corpus는 독립 공개 제품 주장이 아니라 internal-helper 경로를 뒷받침합니다.",
    "evidence.verdict.label": "현재 판정",
    "evidence.verdict.value": "Internal-helper는 가능하고, standalone은 보류입니다.",
    "evidence.verdict.body": "실제 corpus에서 같은 파일 내부 duplicate 신호가 0개라 standalone gate는 아직 실패합니다.",
    "evidence.docs.label": "공개 corpus",
    "evidence.docs.value": "fixture 문서 3개, smoke 전용",
    "evidence.private.label": "Private 검증",
    "evidence.private.value": "owner 보유 snapshot이며 공개 증거가 아닙니다",
    "evidence.release.label": "Standalone release",
    "evidence.release.value": "strict corpus 통과 전까지 보류",
    "evidence.risk.label": "Risk 모델",
    "evidence.risk.value": "키워드 기반이며 완전하지 않습니다",
    "evidence.ci.label": "CI corpus check",
    "evidence.ci.value": "fixture corpus 대상 non-strict smoke",
    "evidence.next.label": "판정 경로",
    "evidence.next.value": "publish 또는 absorption 전에 release checklist 확인",
    "install.title": "Standalone 주장 전에 로컬에서 검증하세요.",
    "install.body":
      "현재 릴리스 경로는 npm deferred입니다. clone, local verify, local audit로 패키지 표면을 계속 검증 가능한 상태로 유지합니다.",
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
      "RuleMeter は、同一ファイル内の重複指示、ファイル間の逐語 overlap、source topology、任意の類似規則候補を示す report-only review aid です。",
    "hero.primary": "GitHub を見る",
    "hero.secondary": "ローカルで試す",
    "workflow.title": "まず報告し、書き換えません。",
    "workflow.body":
      "RuleMeter はファイルを編集しません。ファイル間の逐語 overlap、同一ファイル内の反復、人が見るべきシグナルを示しつつ、キーワード hit がカバレッジ保証ではないことを明示します。",
    "workflow.step1.title": "指示ファイルを発見",
    "workflow.step1.body": "Codex、Claude、Copilot、Antigravity、または既知の全エージェント面を preset で探索します。",
    "workflow.step2.title": "Source topology を確認",
    "workflow.step2.body": "semantic 推測なしに symlink、import、byte-identical mirror、local override の関係を検出します。",
    "workflow.step3.title": "完全重複を確認",
    "workflow.step3.body": "元ファイルを書き換えず、正規化された繰り返し指示文を見つけます。",
    "workflow.step4.title": "意図した topology を承認",
    "workflow.step4.body": "指示ファイルを編集せず、owner-approved topology decisions をローカル ledger に保存します。",
    "signals.title": "レポートが分けるもの",
    "signals.sources.title": "Source topology",
    "signals.sources.body": "指示ファイルが single source、symlink、import、mirror、local override のどの pattern かを確認します。",
    "signals.duplicates.title": "重複と overlap",
    "signals.duplicates.body": "同一ファイル内の削除候補とファイル間 parity/consolidation の確認シグナルを分けます。",
    "signals.risk.title": "キーワード review hit",
    "signals.risk.body": "分類や coverage 保証ではなく、人が確認するキーワード一致を表示します。",
    "signals.similar.title": "類似候補",
    "signals.similar.body": "任意の lexical-overlap レビュー候補であり、自動の意味的 dedupe ではありません。",
    "signals.decisions.title": "Decision ledger",
    "signals.decisions.body": "owner が承認した topology warning を記録し、証拠が変わると stale として表示します。",
    "signals.ci.title": "CI トリップワイヤー",
    "signals.ci.body": "同一ファイル内の削除候補、リスク所見、類似規則、未承認 decisions で失敗させられます。",
    "evidence.title": "製品主張の前に根拠を置きます。",
    "evidence.body":
      "現在の private real-instruction corpus は、standalone 公開製品ではなく internal-helper の経路を支持しています。",
    "evidence.verdict.label": "現在の判定",
    "evidence.verdict.value": "Internal-helper ready; standalone deferred.",
    "evidence.verdict.body": "実 corpus で同一ファイル内 duplicate シグナルが 0 件だったため、standalone gate はまだ失敗します。",
    "evidence.docs.label": "公開 corpus",
    "evidence.docs.value": "fixture docs 3 件、smoke 専用",
    "evidence.private.label": "Private validation",
    "evidence.private.value": "owner-held snapshot; public proof ではありません",
    "evidence.release.label": "Standalone release",
    "evidence.release.value": "strict corpus 通過まで deferred",
    "evidence.risk.label": "Risk model",
    "evidence.risk.value": "keyword-based and non-exhaustive",
    "evidence.ci.label": "CI corpus check",
    "evidence.ci.value": "fixture corpus に対する non-strict smoke",
    "evidence.next.label": "Decision path",
    "evidence.next.value": "publish または absorption 前に release checklist を確認",
    "install.title": "Standalone 主張の前にローカル検証します。",
    "install.body":
      "現在のリリース経路は npm deferred です。clone、local verify、local audit で package surface を検証可能な状態に保ちます。",
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
