import type { Lang } from "./i18n";

const pt = {
  subtitle: "Anonimização de dados sensíveis, em conformidade com o RGPD.",
  readFail: "Não foi possível ler o ficheiro.", emptyDoc: "Insira ou carregue um documento.",
  noneFound: "Nenhum dado sensível detetado — pode marcar manualmente.", failed: "Falha na análise",
  unknownErr: "Erro desconhecido.", exists: "Esta entidade já existe.",
  thEntity: "Entidade", thCategory: "Categoria", thReason: "Justificação",
  modelExpl: "Explicação do modelo", cancel: "Cancelar", noEntities: "Nenhuma entidade detetada.",
  toggleHint: "clique para ativar/desativar", manual: "Marcado manualmente pelo revisor",
  risk: { Alto: "Alto", Médio: "Médio", Baixo: "Baixo", Nenhum: "Nenhum" } as Record<string, string>,
  cats: { nome: "Nome", data: "Data", identificador: "Identificador", contacto: "Contacto", morada: "Morada", saude: "Saúde", financeiro: "Financeiro", biometrico: "Biométrico", religiao_etnia: "Religião/Etnia", outro: "Outro" } as Record<string, string>,
};
type X = typeof pt;

const en: X = {
  subtitle: "AI-powered anonymisation of sensitive data, GDPR compliant.",
  readFail: "Could not read the file.", emptyDoc: "Enter or upload a document.",
  noneFound: "No sensitive data detected — you can mark it manually.", failed: "Analysis failed",
  unknownErr: "Unknown error.", exists: "This entity already exists.",
  thEntity: "Entity", thCategory: "Category", thReason: "Justification",
  modelExpl: "Model explanation", cancel: "Cancel", noEntities: "No entities detected.",
  toggleHint: "click to toggle", manual: "Manually marked by the reviewer",
  risk: { Alto: "High", Médio: "Medium", Baixo: "Low", Nenhum: "None" },
  cats: { nome: "Name", data: "Date", identificador: "Identifier", contacto: "Contact", morada: "Address", saude: "Health", financeiro: "Financial", biometrico: "Biometric", religiao_etnia: "Religion/Ethnicity", outro: "Other" },
};
const fr: X = {
  subtitle: "Anonymisation des données sensibles par IA, conforme au RGPD.",
  readFail: "Impossible de lire le fichier.", emptyDoc: "Saisissez ou importez un document.",
  noneFound: "Aucune donnée sensible détectée — vous pouvez la marquer manuellement.", failed: "Échec de l'analyse",
  unknownErr: "Erreur inconnue.", exists: "Cette entité existe déjà.",
  thEntity: "Entité", thCategory: "Catégorie", thReason: "Justification",
  modelExpl: "Explication du modèle", cancel: "Annuler", noEntities: "Aucune entité détectée.",
  toggleHint: "cliquer pour activer/désactiver", manual: "Marqué manuellement par le réviseur",
  risk: { Alto: "Élevé", Médio: "Moyen", Baixo: "Faible", Nenhum: "Aucun" },
  cats: { nome: "Nom", data: "Date", identificador: "Identifiant", contacto: "Contact", morada: "Adresse", saude: "Santé", financeiro: "Financier", biometrico: "Biométrique", religiao_etnia: "Religion/Ethnie", outro: "Autre" },
};
const it: X = {
  subtitle: "Anonimizzazione dei dati sensibili con IA, conforme al GDPR.",
  readFail: "Impossibile leggere il file.", emptyDoc: "Inserisci o carica un documento.",
  noneFound: "Nessun dato sensibile rilevato — puoi segnarlo manualmente.", failed: "Analisi non riuscita",
  unknownErr: "Errore sconosciuto.", exists: "Questa entità esiste già.",
  thEntity: "Entità", thCategory: "Categoria", thReason: "Motivazione",
  modelExpl: "Spiegazione del modello", cancel: "Annulla", noEntities: "Nessuna entità rilevata.",
  toggleHint: "clicca per attivare/disattivare", manual: "Segnato manualmente dal revisore",
  risk: { Alto: "Alto", Médio: "Medio", Baixo: "Basso", Nenhum: "Nessuno" },
  cats: { nome: "Nome", data: "Data", identificador: "Identificativo", contacto: "Contatto", morada: "Indirizzo", saude: "Salute", financeiro: "Finanziario", biometrico: "Biometrico", religiao_etnia: "Religione/Etnia", outro: "Altro" },
};
const de: X = {
  subtitle: "KI-gestützte Anonymisierung sensibler Daten, DSGVO-konform.",
  readFail: "Die Datei konnte nicht gelesen werden.", emptyDoc: "Dokument eingeben oder hochladen.",
  noneFound: "Keine sensiblen Daten erkannt — Sie können manuell markieren.", failed: "Analyse fehlgeschlagen",
  unknownErr: "Unbekannter Fehler.", exists: "Diese Entität existiert bereits.",
  thEntity: "Entität", thCategory: "Kategorie", thReason: "Begründung",
  modelExpl: "Erklärung des Modells", cancel: "Abbrechen", noEntities: "Keine Entitäten erkannt.",
  toggleHint: "zum Umschalten klicken", manual: "Manuell vom Prüfer markiert",
  risk: { Alto: "Hoch", Médio: "Mittel", Baixo: "Niedrig", Nenhum: "Keins" },
  cats: { nome: "Name", data: "Datum", identificador: "Kennung", contacto: "Kontakt", morada: "Adresse", saude: "Gesundheit", financeiro: "Finanzen", biometrico: "Biometrisch", religiao_etnia: "Religion/Ethnie", outro: "Sonstiges" },
};
const ar: X = {
  subtitle: "إخفاء هوية البيانات الحساسة بالذكاء الاصطناعي، وفقًا للائحة العامة لحماية البيانات.",
  readFail: "تعذّرت قراءة الملف.", emptyDoc: "أدخل مستندًا أو حمّله.",
  noneFound: "لم يتم اكتشاف بيانات حساسة — يمكنك التحديد يدويًا.", failed: "فشل التحليل",
  unknownErr: "خطأ غير معروف.", exists: "هذا العنصر موجود بالفعل.",
  thEntity: "العنصر", thCategory: "الفئة", thReason: "المبرر",
  modelExpl: "شرح النموذج", cancel: "إلغاء", noEntities: "لم يتم اكتشاف عناصر.",
  toggleHint: "انقر للتفعيل/التعطيل", manual: "حُدّد يدويًا من قبل المراجع",
  risk: { Alto: "مرتفع", Médio: "متوسط", Baixo: "منخفض", Nenhum: "لا يوجد" },
  cats: { nome: "الاسم", data: "التاريخ", identificador: "المعرّف", contacto: "الاتصال", morada: "العنوان", saude: "الصحة", financeiro: "مالي", biometrico: "بيومتري", religiao_etnia: "الدين/العرق", outro: "أخرى" },
};
const ja: X = {
  subtitle: "AIによる機密データの匿名化（GDPR準拠）。",
  readFail: "ファイルを読み込めませんでした。", emptyDoc: "文書を入力またはアップロードしてください。",
  noneFound: "機密データは検出されませんでした — 手動で指定できます。", failed: "分析に失敗しました",
  unknownErr: "不明なエラー。", exists: "この項目は既に存在します。",
  thEntity: "項目", thCategory: "カテゴリ", thReason: "理由",
  modelExpl: "モデルの説明", cancel: "キャンセル", noEntities: "項目は検出されませんでした。",
  toggleHint: "クリックで切り替え", manual: "レビュー担当者が手動で指定",
  risk: { Alto: "高", Médio: "中", Baixo: "低", Nenhum: "なし" },
  cats: { nome: "氏名", data: "日付", identificador: "識別子", contacto: "連絡先", morada: "住所", saude: "健康", financeiro: "金融", biometrico: "生体", religiao_etnia: "宗教/民族", outro: "その他" },
};
const zh: X = {
  subtitle: "利用 AI 匿名化敏感数据，符合 GDPR。",
  readFail: "无法读取文件。", emptyDoc: "请输入或上传文档。",
  noneFound: "未检测到敏感数据 — 可手动标记。", failed: "分析失败",
  unknownErr: "未知错误。", exists: "该条目已存在。",
  thEntity: "条目", thCategory: "类别", thReason: "理由",
  modelExpl: "模型说明", cancel: "取消", noEntities: "未检测到条目。",
  toggleHint: "点击切换", manual: "由审核人员手动标记",
  risk: { Alto: "高", Médio: "中", Baixo: "低", Nenhum: "无" },
  cats: { nome: "姓名", data: "日期", identificador: "标识号", contacto: "联系方式", morada: "地址", saude: "健康", financeiro: "财务", biometrico: "生物特征", religiao_etnia: "宗教/民族", outro: "其他" },
};

export const EXTRA: Record<Lang, X> = { pt, en, fr, it, de, ar, ja, zh };
