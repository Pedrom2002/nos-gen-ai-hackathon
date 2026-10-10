// Único ponto de acesso ao backend. Ver README → "Ligar ao backend".
import { SAMPLE } from "@/lib/anonymizer";

export type Category =
  | "nome" | "data" | "identificador" | "contacto" | "morada"
  | "saude" | "financeiro" | "biometrico" | "religiao_etnia" | "outro";

export interface Entity { text: string; category: Category; reason: string; gdpr_basis?: string }
export interface AnalysisResult { entities: Entity[]; summary: string; prompt?: string }

const API_URL = (import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/$/, "");
export const isMockMode = !API_URL;

export async function analyzeDocument(text: string): Promise<AnalysisResult> {
  if (API_URL) {
    const res = await fetch(`${API_URL}/anonymize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`O servidor respondeu com erro ${res.status}.`);
    const data = (await res.json()) as AnalysisResult;
    const result: AnalysisResult = { entities: Array.isArray(data.entities) ? data.entities : [], summary: data.summary ?? "" };
    if (data.prompt) result.prompt = data.prompt;
    return result;
  }
  await new Promise((r) => setTimeout(r, 1500));
  return text.trim() === SAMPLE.trim() ? SAMPLE_RESULT : regexMock(text);
}

const A4 = "Art. 4.º(1) RGPD";
const A9 = "Art. 9.º(1) RGPD — categoria especial";
const e = (text: string, category: Category, reason: string, gdpr_basis = A4): Entity => ({ text, category, reason, gdpr_basis });

const SAMPLE_RESULT: AnalysisResult = {
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
