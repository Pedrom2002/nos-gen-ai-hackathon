export type Lang = "pt" | "en" | "fr" | "it" | "de" | "ar" | "ja" | "zh";

export const LANGS: { id: Lang; label: string; flag: string; rtl?: boolean }[] = [
  { id: "pt", label: "Português", flag: "🇵🇹" },
  { id: "en", label: "English", flag: "🇬🇧" },
  { id: "fr", label: "Français", flag: "🇫🇷" },
  { id: "it", label: "Italiano", flag: "🇮🇹" },
  { id: "de", label: "Deutsch", flag: "🇩🇪" },
  { id: "ar", label: "العربية", flag: "🇸🇦", rtl: true },
  { id: "ja", label: "日本語", flag: "🇯🇵" },
  { id: "zh", label: "中文（普通话）", flag: "🇨🇳" },
];

const pt = {
  heroA: "Lethe — ", heroB: "dados sensíveis fora", heroC: ", significado intacto",
  heroSub: "Deteção automática de dados pessoais e de categorias especiais com IA, validação humana e relatório explicativo.",
  demo: "Modo demo (dados simulados)",
  steps: ["Documento", "Validação", "Resultado"],
  upload: "Carregar .txt / .pdf", example: "Carregar exemplo", placeholder: "Cole aqui o texto do documento…",
  words: "palavras", anonymize: "Anonimizar", analyzing: "A atravessar o Lethe…",
  analyzingSub: "A procurar dados pessoais e categorias especiais (RGPD)",
  errTitle: "Não foi possível analisar o documento", retry: "Tentar novamente",
  noneTitle: "Nenhum dado sensível detetado", noneSub: "Selecione texto abaixo para marcar manualmente o que deve ser anonimizado.",
  back: "Voltar", generate: "Gerar resultado", original: "Original", anonymized: "Anonimizado", review: "Rever",
  copy: "Copiar", copied: "Copiado", downloadTxt: "Descarregar .txt", downloadReport: "Descarregar relatório",
  reportTitle: "Relatório explicativo", entities: "Entidades", pctWords: "Palavras anonimizadas", risk: "Nível de risco",
  settings: "Definições", appearance: "Aspeto", theme: "Tema", light: "Claro", dark: "Escuro", system: "Sistema",
  accent: "Cor de destaque",
  language: "Língua", reset: "Repor predefinições",
};
type Dict = typeof pt;

const en: Dict = {
  heroA: "Lethe — ", heroB: "sensitive data out", heroC: ", meaning intact",
  heroSub: "AI-powered detection of personal and special-category data, human validation and an explanatory report.",
  demo: "Demo mode (simulated data)",
  steps: ["Document", "Review", "Result"],
  upload: "Upload .txt / .pdf", example: "Load example", placeholder: "Paste the document text here…",
  words: "words", anonymize: "Anonymize", analyzing: "Crossing the Lethe…",
  analyzingSub: "Looking for personal and special-category data (GDPR)",
  errTitle: "The document could not be analyzed", retry: "Try again",
  noneTitle: "No sensitive data detected", noneSub: "Select text below to manually mark what should be anonymized.",
  back: "Back", generate: "Generate result", original: "Original", anonymized: "Anonymized", review: "Review",
  copy: "Copy", copied: "Copied", downloadTxt: "Download .txt", downloadReport: "Download report",
  reportTitle: "Explanatory report", entities: "Entities", pctWords: "Words anonymized", risk: "Risk level",
  settings: "Settings", appearance: "Appearance", theme: "Theme", light: "Light", dark: "Dark", system: "System",
  accent: "Accent colour",
  language: "Language", reset: "Reset to defaults",
};

const fr: Dict = {
  heroA: "Lethe — ", heroB: "données sensibles retirées", heroC: ", sens préservé",
  heroSub: "Détection par IA des données personnelles et sensibles, validation humaine et rapport explicatif.",
  demo: "Mode démo (données simulées)",
  steps: ["Document", "Validation", "Résultat"],
  upload: "Importer .txt / .pdf", example: "Charger l’exemple", placeholder: "Collez ici le texte du document…",
  words: "mots", anonymize: "Anonymiser", analyzing: "Traversée du Léthé…",
  analyzingSub: "Recherche de données personnelles et sensibles (RGPD)",
  errTitle: "Impossible d’analyser le document", retry: "Réessayer",
  noneTitle: "Aucune donnée sensible détectée", noneSub: "Sélectionnez du texte ci-dessous pour le marquer manuellement.",
  back: "Retour", generate: "Générer le résultat", original: "Original", anonymized: "Anonymisé", review: "Revoir",
  copy: "Copier", copied: "Copié", downloadTxt: "Télécharger .txt", downloadReport: "Télécharger le rapport",
  reportTitle: "Rapport explicatif", entities: "Entités", pctWords: "Mots anonymisés", risk: "Niveau de risque",
  settings: "Paramètres", appearance: "Apparence", theme: "Thème", light: "Clair", dark: "Sombre", system: "Système",
  accent: "Couleur d’accent",
  language: "Langue", reset: "Réinitialiser",
};

const it: Dict = {
  heroA: "Lethe — ", heroB: "dati sensibili rimossi", heroC: ", significato intatto",
  heroSub: "Rilevamento con IA di dati personali e particolari, validazione umana e report esplicativo.",
  demo: "Modalità demo (dati simulati)",
  steps: ["Documento", "Verifica", "Risultato"],
  upload: "Carica .txt / .pdf", example: "Carica esempio", placeholder: "Incolla qui il testo del documento…",
  words: "parole", anonymize: "Anonimizza", analyzing: "Attraversando il Lete…",
  analyzingSub: "Ricerca di dati personali e categorie particolari (GDPR)",
  errTitle: "Impossibile analizzare il documento", retry: "Riprova",
  noneTitle: "Nessun dato sensibile rilevato", noneSub: "Seleziona il testo qui sotto per contrassegnarlo manualmente.",
  back: "Indietro", generate: "Genera risultato", original: "Originale", anonymized: "Anonimizzato", review: "Rivedi",
  copy: "Copia", copied: "Copiato", downloadTxt: "Scarica .txt", downloadReport: "Scarica report",
  reportTitle: "Report esplicativo", entities: "Entità", pctWords: "Parole anonimizzate", risk: "Livello di rischio",
  settings: "Impostazioni", appearance: "Aspetto", theme: "Tema", light: "Chiaro", dark: "Scuro", system: "Sistema",
  accent: "Colore principale",
  language: "Lingua", reset: "Ripristina predefiniti",
};

const de: Dict = {
  heroA: "Lethe — ", heroB: "sensible Daten raus", heroC: ", Bedeutung bleibt",
  heroSub: "KI-gestützte Erkennung personenbezogener und besonderer Daten, menschliche Prüfung und erklärender Bericht.",
  demo: "Demo-Modus (simulierte Daten)",
  steps: ["Dokument", "Prüfung", "Ergebnis"],
  upload: ".txt / .pdf hochladen", example: "Beispiel laden", placeholder: "Dokumenttext hier einfügen…",
  words: "Wörter", anonymize: "Anonymisieren", analyzing: "Überquere die Lethe…",
  analyzingSub: "Suche nach personenbezogenen und besonderen Daten (DSGVO)",
  errTitle: "Das Dokument konnte nicht analysiert werden", retry: "Erneut versuchen",
  noneTitle: "Keine sensiblen Daten erkannt", noneSub: "Text unten markieren, um ihn manuell zu anonymisieren.",
  back: "Zurück", generate: "Ergebnis erzeugen", original: "Original", anonymized: "Anonymisiert", review: "Prüfen",
  copy: "Kopieren", copied: "Kopiert", downloadTxt: ".txt herunterladen", downloadReport: "Bericht herunterladen",
  reportTitle: "Erklärender Bericht", entities: "Entitäten", pctWords: "Anonymisierte Wörter", risk: "Risikostufe",
  settings: "Einstellungen", appearance: "Darstellung", theme: "Design", light: "Hell", dark: "Dunkel", system: "System",
  accent: "Akzentfarbe",
  language: "Sprache", reset: "Zurücksetzen",
};

const ar: Dict = {
  heroA: "Lethe — ", heroB: "إزالة البيانات الحساسة", heroC: "، مع الحفاظ على المعنى",
  heroSub: "كشف تلقائي للبيانات الشخصية والفئات الخاصة بالذكاء الاصطناعي، مع تحقق بشري وتقرير توضيحي.",
  demo: "وضع تجريبي (بيانات محاكاة)",
  steps: ["المستند", "المراجعة", "النتيجة"],
  upload: "رفع ‎.txt / .pdf", example: "تحميل مثال", placeholder: "الصق نص المستند هنا…",
  words: "كلمة", anonymize: "إخفاء الهوية", analyzing: "عبور نهر ليثي…",
  analyzingSub: "البحث عن البيانات الشخصية والفئات الخاصة (اللائحة العامة لحماية البيانات)",
  errTitle: "تعذّر تحليل المستند", retry: "إعادة المحاولة",
  noneTitle: "لم يتم اكتشاف بيانات حساسة", noneSub: "حدّد نصًا أدناه لتمييزه يدويًا.",
  back: "رجوع", generate: "إنشاء النتيجة", original: "الأصل", anonymized: "بعد الإخفاء", review: "مراجعة",
  copy: "نسخ", copied: "تم النسخ", downloadTxt: "تنزيل ‎.txt", downloadReport: "تنزيل التقرير",
  reportTitle: "التقرير التوضيحي", entities: "الكيانات", pctWords: "الكلمات المخفية", risk: "مستوى الخطر",
  settings: "الإعدادات", appearance: "المظهر", theme: "السمة", light: "فاتح", dark: "داكن", system: "النظام",
  accent: "اللون المميز",
  language: "اللغة", reset: "استعادة الافتراضي",
};

const ja: Dict = {
  heroA: "Lethe — ", heroB: "機密データを除去", heroC: "、意味はそのまま",
  heroSub: "AIによる個人データ・特別カテゴリデータの自動検出、人による確認、説明レポート。",
  demo: "デモモード（模擬データ）",
  steps: ["文書", "確認", "結果"],
  upload: ".txt / .pdf をアップロード", example: "サンプルを読み込む", placeholder: "ここに文書のテキストを貼り付け…",
  words: "語", anonymize: "匿名化", analyzing: "レーテーを渡っています…",
  analyzingSub: "個人データと特別カテゴリ（GDPR）を検索中",
  errTitle: "文書を分析できませんでした", retry: "再試行",
  noneTitle: "機密データは検出されませんでした", noneSub: "下のテキストを選択して手動でマークできます。",
  back: "戻る", generate: "結果を生成", original: "原文", anonymized: "匿名化後", review: "確認に戻る",
  copy: "コピー", copied: "コピーしました", downloadTxt: ".txt をダウンロード", downloadReport: "レポートをダウンロード",
  reportTitle: "説明レポート", entities: "エンティティ", pctWords: "匿名化された語", risk: "リスクレベル",
  settings: "設定", appearance: "外観", theme: "テーマ", light: "ライト", dark: "ダーク", system: "システム",
  accent: "アクセントカラー",
  language: "言語", reset: "初期設定に戻す",
};

const zh: Dict = {
  heroA: "Lethe — ", heroB: "去除敏感数据", heroC: "，保留原意",
  heroSub: "利用 AI 自动识别个人数据和特殊类别数据，人工审核并生成说明报告。",
  demo: "演示模式（模拟数据）",
  steps: ["文档", "审核", "结果"],
  upload: "上传 .txt / .pdf", example: "加载示例", placeholder: "在此粘贴文档文本…",
  words: "个词", anonymize: "匿名化", analyzing: "正在渡过忘川…",
  analyzingSub: "正在查找个人数据和特殊类别数据（GDPR）",
  errTitle: "无法分析该文档", retry: "重试",
  noneTitle: "未检测到敏感数据", noneSub: "在下方选择文本以手动标记。",
  back: "返回", generate: "生成结果", original: "原文", anonymized: "匿名化后", review: "重新审核",
  copy: "复制", copied: "已复制", downloadTxt: "下载 .txt", downloadReport: "下载报告",
  reportTitle: "说明报告", entities: "实体", pctWords: "已匿名化词语", risk: "风险等级",
  settings: "设置", appearance: "外观", theme: "主题", light: "浅色", dark: "深色", system: "跟随系统",
  accent: "强调色",
  language: "语言", reset: "恢复默认",
};

export const DICTS: Record<Lang, Dict> = { pt, en, fr, it, de, ar, ja, zh };
export type { Dict };
