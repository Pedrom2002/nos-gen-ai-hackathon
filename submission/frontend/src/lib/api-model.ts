// The API model shared by the web frontend and the mobile app: wire types,
// how a document state becomes entities for the review, and demo results.
// Pure TypeScript: no build-time env, DOM or storage, relative imports only,
// so Metro (React Native) can bundle it as well as Vite.
import { SAMPLE, type WordRange } from "./anonymizer";

// Wire types of the API, from submission/api/README.md.
export interface ApiItem {
  id: string;            // "L5-1": line 5, first word index 1
  line: number;          // 1-based line in `lines`
  first: number;         // first and last word index in that line (0-based)
  last: number;
  words: number;
  text: string;
  category: string;      // "Pessoa" | "Identificação" | "Contacto" | "Financeiro" | "Biométrico"
  role: string;          // "titular" | "familiar" | "contacto" | "profissional" | "outro" | ""
  reason: string;
  source: "modelo" | "rede de segurança";
  kept: boolean;
}
export interface DocumentState {
  id: string;
  name: string;
  lines: string[];       // original lines, empty lines removed
  output: string[];      // masked lines, same layout as `lines`
  items: ApiItem[];
  summary: { items: number; masked_words: number; by_category: Record<string, number> };
  leaks: { checked: number; leaks: { line: number; text: string }[] };
  kind?: "text" | "pdf" | "scanned" | "image" | "docx";
  redactable?: boolean;  // download/redacted gives the file with the words removed
  uncertain?: number;    // OCR words read with low confidence
  unread?: number;       // text lines OCR saw but could not read
}

export interface Detected { text: string; category: string; reason: string; gdpr_basis?: string; role?: string; refs?: string[]; at?: WordRange[] }
export interface AnalysisResult {
  docId?: string;        // backend document, absent in demo mode
  text: string;          // the document as the backend read it
  entities: Detected[];
  summary: string;
  /** The backend can return the original file with the masked words removed. */
  redactable?: boolean;
  /** Text lines the backend's OCR saw but could not read (no redacted file then). */
  unread?: number;
}


/** The slice of a line covered by words first..last, split on whitespace like the backend. */
export function spanText(line: string, first: number, last: number): string {
  const words = [...line.matchAll(/\S+/g)];
  const a = words[first], b = words[last];
  if (!a || !b) return "";
  return line.slice(a.index, b.index + b[0].length);
}

export function describe(state: DocumentState): string {
  const { summary, leaks } = state;
  const cats = Object.entries(summary.by_category).map(([c, n]) => `${n} ${c}`).join(", ");
  const safety = state.items.filter((i) => !i.kept && i.source !== "modelo").length;
  const head = summary.items
    ? `Ficam mascaradas ${summary.masked_words} palavras em ${summary.items} dados que identificam pessoas (${cats}).`
      + (safety ? ` ${safety} foram apanhados pela rede de segurança (padrões de email, telefone, IBAN, CC, IP e GPS).` : "")
    : "Não foi encontrado nenhum dado que identifique uma pessoa.";
  const check = leaks.leaks.length
    ? `Verificação de fugas: ${leaks.leaks.length} de ${leaks.checked} valores continuam legíveis no resultado (linha ${leaks.leaks.map((l) => l.line).join(", ")}).`
    : `Verificação de fugas: 0 fugas em ${leaks.checked} valores verificados.`;
  return `${head} ${check} O conteúdo clínico, as características e a data e referência do documento mantêm-se visíveis, porque sozinhos não identificam ninguém.`;
}

/** Entities the review can find by text: one per distinct value, with every backend id it covers. */
export function fromState(state: DocumentState): AnalysisResult {
  const byText = new Map<string, Detected>();
  for (const item of state.items) {
    const text = spanText(state.lines[item.line - 1] ?? "", item.first, item.last) || item.text;
    const at = { line: item.line, first: item.first, last: item.last };
    const seen = byText.get(text);
    if (seen) { seen.refs?.push(item.id); seen.at?.push(at); continue; }
    const entity: Detected = { text, category: item.category, reason: item.reason, refs: [item.id], at: [at] };
    if (item.role) entity.role = item.role;
    byText.set(text, entity);
  }
  return {
    docId: state.id, text: state.lines.join("\n"), entities: [...byText.values()], summary: describe(state),
    redactable: !!state.redactable && !state.unread, unread: state.unread ?? 0,
  };
}

/** The file name from Content-Disposition (RFC 5987 or plain), or a fallback. */
export function filenameFrom(header: string | null, fallback: string): string {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header ?? "");
  if (star?.[1]) { try { return decodeURIComponent(star[1]); } catch { /* fall through */ } }
  const plain = /filename="?([^";]+)"?/i.exec(header ?? "");
  return plain?.[1] ?? fallback;
}

const A4 = "Art. 4.º(1) RGPD";
const e = (text: string, category: string, reason: string, gdpr_basis = A4): Detected => ({ text, category, reason, gdpr_basis });

// Demo do documento da NOS, igual à referência validada com os mentores:
// só se mascara o que identifica uma pessoa. Dados clínicos, a referência
// do processo e características como a etnia ficam visíveis.
const SAMPLE_RESULT: Omit<AnalysisResult, "text"> = {
  entities: [
    e("Maria Conceição Oliveira Santos", "nome", "Nome completo da paciente"),
    e("Maria Santos", "nome", "Nome abreviado da paciente"),
    e("João", "nome", "Nome de um familiar"),
    e("Ana", "nome", "Nome de um familiar"),
    e("António Santos", "nome", "Nome do contacto de emergência"),
    e("Joana Pereira", "nome", "Nome de uma pessoa de contacto"),
    e("Carlos Mendes", "nome", "Nome do médico responsável"),
    e("12/03/1978", "data", "Data de nascimento"),
    e("097865413", "identificador", "Número de Identificação Fiscal (NIF)"),
    e("12345678-9ZX0", "identificador", "Número do Cartão de Cidadão"),
    e("11223344556", "identificador", "Número da Segurança Social"),
    e("987654321", "identificador", "Número da apólice do seguro de saúde"),
    e("12345-PT", "identificador", "Número da cédula profissional do médico"),
    e("ID-BIO-12345", "biometrico", "Identificador da impressão digital"),
    e("FACE-ID-78901", "biometrico", "Identificador do reconhecimento facial"),
    e("Rua das Flores, 123, Apt 45, Sacavém, Lisboa", "morada", "Morada completa de residência"),
    e("+351 912 345 678", "contacto", "Telefone pessoal da paciente"),
    e("+351961234567", "contacto", "Telefone do contacto de emergência"),
    e("+351939876543", "contacto", "Telefone de uma pessoa de contacto"),
    e("+351213456789", "contacto", "Telefone do médico"),
    e("maria.santos@emailpessoal.pt", "contacto", "Email pessoal da paciente"),
    e("antonio.santos@emailpessoal.pt", "contacto", "Email do contacto de emergência"),
    e("carlos.mendes@centromedicalisboa.pt", "contacto", "Email do médico"),
    e("4111 2222 3333 4444", "financeiro", "Número de cartão de crédito"),
    e("09/27", "financeiro", "Validade do cartão de crédito"),
    e("123", "financeiro", "Código de segurança do cartão (CVV)"),
  ],
  summary:
    "Relatório clínico de admissão. Foram mascarados os dados que identificam pessoas: nomes, data de nascimento, NIF, Cartão de Cidadão, Segurança Social, apólice, identificadores biométricos, morada, telefones, emails e dados do cartão. A informação clínica e a referência do processo mantêm-se, para o documento continuar útil.",
};

function regexMock(text: string): Omit<AnalysisResult, "text"> {
  const rules: [RegExp, string, string][] = [
    [/[\w.+-]+@[\w-]+\.[\w.]+/g, "contacto", "Endereço de email"],
    [/(?:\+351\s?)?9\d{2}\s?\d{3}\s?\d{3}\b/g, "contacto", "Número de telefone"],
    [/\b\d{9}\b/g, "identificador", "Possível NIF (9 dígitos)"],
    [/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, "data", "Data"],
  ];
  const seen = new Set<string>();
  const entities: Detected[] = [];
  for (const [re, cat, reason] of rules)
    for (const m of text.match(re) ?? [])
      if (!seen.has(m)) { seen.add(m); entities.push(e(m, cat, reason)); }
  return {
    entities,
    summary: entities.length
      ? `Foram detetados ${entities.length} dados por padrões simples (emails, telefones, NIF e datas). Ligue o backend para uma análise completa com IA.`
      : "Não foram encontrados padrões simples. Ligue o backend para uma análise completa com IA.",
  };
}

/** What demo mode answers: the reference result for the NOS sample, simple patterns otherwise. */
export function demoAnalysis(text: string): AnalysisResult {
  const mock = text.trim() === SAMPLE.trim() ? SAMPLE_RESULT : regexMock(text);
  return { text, ...mock };
}
