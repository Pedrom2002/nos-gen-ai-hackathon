// Único ponto de acesso ao backend (submission/api). Ver README → "Ligar ao backend".
import { SAMPLE } from "@/lib/anonymizer";

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
}

export interface Detected { text: string; category: string; reason: string; gdpr_basis?: string; role?: string; refs?: string[] }
export interface AnalysisResult {
  docId?: string;        // backend document, absent in demo mode
  text: string;          // the document as the backend read it
  entities: Detected[];
  summary: string;
}

// "/" keeps the requests on the page's origin, where the Vite dev server
// proxies /api to the backend (vite.config.ts). A full URL calls it directly.
const RAW = import.meta.env["VITE_API_URL"] as string | undefined;
export const isMockMode = !RAW;
const BASE = (RAW ?? "").replace(/\/$/, "");

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, init);
  if (!res.ok) {
    let detail = `O servidor respondeu com erro ${res.status}.`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch { /* not JSON */ }
    throw new Error(detail);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** The slice of a line covered by words first..last, split on whitespace like the backend. */
export function spanText(line: string, first: number, last: number): string {
  const words = [...line.matchAll(/\S+/g)];
  const a = words[first], b = words[last];
  if (!a || !b) return "";
  return line.slice(a.index, b.index + b[0].length);
}

function describe(state: DocumentState): string {
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
    const seen = byText.get(text);
    if (seen) { seen.refs?.push(item.id); continue; }
    const entity: Detected = { text, category: item.category, reason: item.reason, refs: [item.id] };
    if (item.role) entity.role = item.role;
    byText.set(text, entity);
  }
  return { docId: state.id, text: state.lines.join("\n"), entities: [...byText.values()], summary: describe(state) };
}

/** Send the file itself when it was not edited, so a PDF is read the way run.py reads it. */
export async function analyzeDocument(text: string, file?: File | null): Promise<AnalysisResult> {
  if (!isMockMode) {
    const form = new FormData();
    form.append("file", file ?? new File([text], "documento.txt", { type: "text/plain" }));
    return fromState(await api<DocumentState>("/documents", { method: "POST", body: form }));
  }
  await new Promise((r) => setTimeout(r, 1500));
  const mock = text.trim() === SAMPLE.trim() ? SAMPLE_RESULT : regexMock(text);
  return { text, ...mock };
}

/** Tell the backend which items the reviewer keeps visible; returns the refreshed summary. */
export async function syncDecisions(docId: string, keep: string[]): Promise<string> {
  const state = await api<DocumentState>(`/documents/${docId}/decisions`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keep }),
  });
  return describe(state);
}

export async function deleteDocument(docId: string): Promise<void> {
  await api<void>(`/documents/${docId}`, { method: "DELETE" });
}

const A4 = "Art. 4.º(1) RGPD";
const A9 = "Art. 9.º(1) RGPD — categoria especial";
const e = (text: string, category: string, reason: string, gdpr_basis = A4): Detected => ({ text, category, reason, gdpr_basis });

const SAMPLE_RESULT: Omit<AnalysisResult, "text"> = {
  entities: [
    e("Maria Conceição Oliveira Santos", "nome", "Nome completo da paciente"),
    e("Maria Santos", "nome", "Nome abreviado da paciente"),
    e("João", "nome", "Primeiro nome de terceiro identificável"),
    e("Ana", "nome", "Primeiro nome de terceiro identificável"),
    e("António Santos", "nome", "Nome do contacto de emergência (familiar)"),
    e("Joana Pereira", "nome", "Nome de profissional/terceiro identificável"),
    e("irmão", "outro", "Relação familiar que ajuda a identificar o contacto"),
    e("15 de abril de 2025", "data", "Data da admissão, associável à paciente"),
    e("12/03/1978", "data", "Data de nascimento"),
    e("47 anos", "data", "Idade da paciente"),
    e("2018", "data", "Data associada ao diagnóstico de VIH"),
    e("ADM-2025-04-15-089", "identificador", "Referência única do processo clínico"),
    e("097865413", "identificador", "Número de Identificação Fiscal (NIF)"),
    e("12345678-9ZX0", "identificador", "Número do Cartão de Cidadão"),
    e("11223344556", "identificador", "Número da Segurança Social"),
    e("Rua das Flores, 123, Apt 45, Sacavém, Lisboa", "morada", "Morada completa de residência"),
    e("+351 912 345 678", "contacto", "Telefone pessoal da paciente"),
    e("+351961234567", "contacto", "Telefone pessoal do contacto de emergência"),
    e("maria.santos@emailpessoal.pt", "contacto", "Email pessoal da paciente"),
    e("antonio.santos@emailpessoal.pt", "contacto", "Email pessoal do contacto de emergência"),
    e("Feminino", "outro", "Sexo — contribui para a reidentificação"),
    e("caucasiana", "religiao_etnia", "Origem étnica/racial", A9),
    e("dores abdominais intensas", "saude", "Sintoma clínico", A9),
    e("hipertensão", "saude", "Diagnóstico clínico", A9),
    e("diabetes tipo 2", "saude", "Diagnóstico clínico", A9),
    e("HIV positivo", "saude", "Estado serológico", A9),
    e("carga viral indetectável", "saude", "Resultado clínico", A9),
    e("antirretrovirais", "saude", "Medicação que revela condição de saúde", A9),
    e("BRCA1", "saude", "Dado genético (mutação hereditária)", A9),
    e("4111 2222 3333 4444", "financeiro", "Número de cartão de crédito"),
    e("09/27", "financeiro", "Validade do cartão de crédito"),
    e("CVV 123", "financeiro", "Código de segurança do cartão"),
    e("€62.500", "financeiro", "Rendimento anual declarado"),
  ],
  summary:
    "O documento é um relatório clínico de admissão com elevada densidade de dados pessoais. Foram identificados identificadores diretos (nome, NIF, Cartão de Cidadão, Segurança Social, contactos e morada) que permitem identificar a paciente e o seu familiar. Inclui ainda categorias especiais ao abrigo do art. 9.º do RGPD — dados de saúde (hipertensão, diabetes, estado serológico VIH e medicação) e origem étnica — cuja exposição representa risco elevado de discriminação. Os dados financeiros (cartão, CVV, rendimento) permitem fraude direta. Todos foram anonimizados, preservando a estrutura e o significado clínico geral do documento.",
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
