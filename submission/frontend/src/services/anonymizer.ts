// Único ponto de acesso ao backend. Ver README → "Ligar ao backend".
import { SAMPLE } from "@/lib/anonymizer";

export type Category =
  | "nome" | "data" | "identificador" | "contacto" | "morada"
  | "saude" | "financeiro" | "biometrico" | "religiao_etnia" | "outro";

export interface Entity { text: string; category: Category; reason: string; gdpr_basis?: string }
export interface AnalysisResult {
  entities: Entity[];
  summary: string;
  prompt?: string;
  /** Texto final do pipeline do backend (o mesmo que `run.py` escreve). */
  masked_text?: string;
}

const API_URL = (import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/$/, "");
export const isMockMode = !API_URL;

export async function analyzeDocument(text: string): Promise<AnalysisResult> {
  if (API_URL) {
    const res = await fetch(`${API_URL}/api/anonymize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      // A API explica sempre o erro em português no campo `detail`.
      const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
      const detail = typeof body?.detail === "string" ? body.detail : "";
      throw new Error(detail || `O servidor respondeu com erro ${res.status}.`);
    }
    const data = (await res.json()) as AnalysisResult;
    const result: AnalysisResult = { entities: Array.isArray(data.entities) ? data.entities : [], summary: data.summary ?? "" };
    if (data.prompt) result.prompt = data.prompt;
    if (typeof data.masked_text === "string") result.masked_text = data.masked_text;
    return result;
  }
  await new Promise((r) => setTimeout(r, 1500));
  return text.trim() === SAMPLE.trim() ? SAMPLE_RESULT : regexMock(text);
}

const A4 = "Art. 4.º(1) RGPD";
const e = (text: string, category: Category, reason: string, gdpr_basis = A4): Entity => ({ text, category, reason, gdpr_basis });

// Demo do documento da NOS, igual à referência validada com os mentores:
// só se mascara o que identifica uma pessoa. Dados clínicos, a referência
// do processo e características como a etnia ficam visíveis.
const SAMPLE_RESULT: AnalysisResult = {
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
    e("CVV 123", "financeiro", "Código de segurança do cartão"),
  ],
  summary:
    "Relatório clínico de admissão. Foram mascarados os dados que identificam pessoas: nomes, data de nascimento, NIF, Cartão de Cidadão, Segurança Social, apólice, identificadores biométricos, morada, telefones, emails e dados do cartão. A informação clínica e a referência do processo mantêm-se, para o documento continuar útil.",
};

function regexMock(text: string): AnalysisResult {
  const rules: [RegExp, Category, string][] = [
    [/[\w.+-]+@[\w-]+\.[\w.]+/g, "contacto", "Endereço de email"],
    [/(?:\+351\s?)?9\d{2}\s?\d{3}\s?\d{3}\b/g, "contacto", "Número de telefone"],
    [/\b\d{9}\b/g, "identificador", "Possível NIF (9 dígitos)"],
    [/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, "data", "Data"],
  ];
  const seen = new Set<string>();
  const entities: Entity[] = [];
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
