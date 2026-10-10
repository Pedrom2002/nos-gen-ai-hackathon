// Texts that only the mobile app needs, in the same 8 languages as the web.
// Everything else comes from the web dictionaries (@web/lib/i18n*).
import type { Lang } from "@web/lib/i18n";

const pt = {
  takePhoto: "Fotografar documento",
  pickImage: "Escolher imagem",
  share: "Partilhar",
  shareTxt: "Partilhar .txt",
  shareReport: "Partilhar relatório",
  shareRedacted: "Partilhar ficheiro censurado",
  newDocument: "Novo documento",
  apiUrl: "Endereço da API",
  apiUrlHint: "O endereço do túnel ou do computador com a API, por exemplo abc.trycloudflare.com. Vazio = modo demo.",
  testConnection: "Testar ligação",
  connected: "Ligado à API",
  permissionDenied: "Sem permissão. Pode dá-la nas definições do telemóvel.",
  fileTooBig: "{name} tem {size}; o limite é 25 MB.",
  analyzingSteps: ["Enviar o documento", "Ler o texto", "Procurar dados pessoais", "Verificar fugas"],
};
type Strings = typeof pt;

const en: Strings = {
  takePhoto: "Take a photo of a document",
  pickImage: "Choose an image",
  share: "Share",
  shareTxt: "Share .txt",
  shareReport: "Share report",
  shareRedacted: "Share redacted file",
  newDocument: "New document",
  apiUrl: "API address",
  apiUrlHint: "The tunnel or the computer running the API, for example abc.trycloudflare.com. Empty = demo mode.",
  testConnection: "Test connection",
  connected: "Connected to the API",
  permissionDenied: "No permission. You can grant it in the phone settings.",
  fileTooBig: "{name} is {size}; the limit is 25 MB.",
  analyzingSteps: ["Sending the document", "Reading the text", "Looking for personal data", "Checking for leaks"],
};

const fr: Strings = {
  takePhoto: "Photographier un document",
  pickImage: "Choisir une image",
  share: "Partager",
  shareTxt: "Partager le .txt",
  shareReport: "Partager le rapport",
  shareRedacted: "Partager le fichier caviardé",
  newDocument: "Nouveau document",
  apiUrl: "Adresse de l’API",
  apiUrlHint: "Le tunnel ou l’ordinateur qui exécute l’API, par exemple abc.trycloudflare.com. Vide = mode démo.",
  testConnection: "Tester la connexion",
  connected: "Connecté à l’API",
  permissionDenied: "Pas d’autorisation. Vous pouvez l’accorder dans les réglages du téléphone.",
  fileTooBig: "{name} fait {size} ; la limite est de 25 MB.",
  analyzingSteps: ["Envoi du document", "Lecture du texte", "Recherche de données personnelles", "Vérification des fuites"],
};

const it: Strings = {
  takePhoto: "Fotografa un documento",
  pickImage: "Scegli un’immagine",
  share: "Condividi",
  shareTxt: "Condividi .txt",
  shareReport: "Condividi report",
  shareRedacted: "Condividi file oscurato",
  newDocument: "Nuovo documento",
  apiUrl: "Indirizzo dell’API",
  apiUrlHint: "Il tunnel o il computer con l’API, per esempio abc.trycloudflare.com. Vuoto = modalità demo.",
  testConnection: "Prova connessione",
  connected: "Connesso all’API",
  permissionDenied: "Nessun permesso. Puoi concederlo nelle impostazioni del telefono.",
  fileTooBig: "{name} pesa {size}; il limite è 25 MB.",
  analyzingSteps: ["Invio del documento", "Lettura del testo", "Ricerca di dati personali", "Verifica delle fughe"],
};

const de: Strings = {
  takePhoto: "Dokument fotografieren",
  pickImage: "Bild auswählen",
  share: "Teilen",
  shareTxt: ".txt teilen",
  shareReport: "Bericht teilen",
  shareRedacted: "Geschwärzte Datei teilen",
  newDocument: "Neues Dokument",
  apiUrl: "API-Adresse",
  apiUrlHint: "Der Tunnel oder der Computer mit der API, zum Beispiel abc.trycloudflare.com. Leer = Demomodus.",
  testConnection: "Verbindung testen",
  connected: "Mit der API verbunden",
  permissionDenied: "Keine Berechtigung. Sie können sie in den Telefoneinstellungen erteilen.",
  fileTooBig: "{name} hat {size}; das Limit sind 25 MB.",
  analyzingSteps: ["Dokument senden", "Text lesen", "Personenbezogene Daten suchen", "Auf Lecks prüfen"],
};

const ar: Strings = {
  takePhoto: "تصوير مستند",
  pickImage: "اختيار صورة",
  share: "مشاركة",
  shareTxt: "مشاركة ‎.txt",
  shareReport: "مشاركة التقرير",
  shareRedacted: "مشاركة الملف المحجوب",
  newDocument: "مستند جديد",
  apiUrl: "عنوان الواجهة البرمجية",
  apiUrlHint: "النفق أو الحاسوب الذي يشغّل الواجهة، مثل abc.trycloudflare.com. فارغ = وضع العرض.",
  testConnection: "اختبار الاتصال",
  connected: "متصل بالواجهة البرمجية",
  permissionDenied: "لا يوجد إذن. يمكنك منحه من إعدادات الهاتف.",
  fileTooBig: "حجم {name} هو {size}؛ الحد الأقصى 25 MB.",
  analyzingSteps: ["إرسال المستند", "قراءة النص", "البحث عن البيانات الشخصية", "التحقق من التسريبات"],
};

const ja: Strings = {
  takePhoto: "文書を撮影",
  pickImage: "画像を選択",
  share: "共有",
  shareTxt: ".txt を共有",
  shareReport: "レポートを共有",
  shareRedacted: "黒塗りファイルを共有",
  newDocument: "新しい文書",
  apiUrl: "API のアドレス",
  apiUrlHint: "API を実行しているトンネルまたはコンピューター（例: abc.trycloudflare.com）。空欄 = デモモード。",
  testConnection: "接続をテスト",
  connected: "API に接続しました",
  permissionDenied: "権限がありません。電話の設定で許可できます。",
  fileTooBig: "{name} は {size} です。上限は 25 MB です。",
  analyzingSteps: ["文書を送信", "テキストを読み取り", "個人データを検索", "漏えいを確認"],
};

const zh: Strings = {
  takePhoto: "拍摄文档",
  pickImage: "选择图片",
  share: "分享",
  shareTxt: "分享 .txt",
  shareReport: "分享报告",
  shareRedacted: "分享已遮盖的文件",
  newDocument: "新文档",
  apiUrl: "API 地址",
  apiUrlHint: "运行 API 的隧道或电脑，例如 abc.trycloudflare.com。留空 = 演示模式。",
  testConnection: "测试连接",
  connected: "已连接到 API",
  permissionDenied: "没有权限。可在手机设置中授予。",
  fileTooBig: "{name} 大小为 {size}；上限为 25 MB。",
  analyzingSteps: ["发送文档", "读取文本", "查找个人数据", "检查泄露"],
};

export type MobileStrings = Strings;
export const MOBILE: Record<Lang, Strings> = { pt, en, fr, it, de, ar, ja, zh };
