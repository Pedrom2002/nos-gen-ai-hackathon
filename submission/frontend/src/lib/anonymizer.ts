export const CATEGORIES = [
  { id: "nome", label: "Nome", color: "var(--cat-nome)" },
  { id: "data", label: "Data", color: "var(--cat-data)" },
  { id: "identificador", label: "Identificador", color: "var(--cat-id)" },
  { id: "contacto", label: "Contacto", color: "var(--cat-contacto)" },
  { id: "morada", label: "Morada", color: "var(--cat-morada)" },
  { id: "saude", label: "Saúde", color: "var(--cat-saude)" },
  { id: "financeiro", label: "Financeiro", color: "var(--cat-financeiro)" },
  { id: "biometrico", label: "Biométrico", color: "var(--cat-biometrico)" },
  { id: "religiao_etnia", label: "Religião/Etnia", color: "var(--cat-religiao)" },
  { id: "outro", label: "Outro", color: "var(--cat-outro)" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export interface Entity {
  id: string;
  text: string;
  category: CategoryId;
  reason: string;
  gdpr_basis: string;
  enabled: boolean;
  manual?: boolean;
  role?: string | undefined;      // who the datum belongs to, from the backend
  refs?: string[] | undefined;    // backend item ids this entity covers
}

export const catOf = (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[9];

export function normalizeCategory(raw: string): CategoryId {
  const s = (raw || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/nome|name|pessoa/.test(s)) return "nome";
  if (/data|date|idade|age/.test(s)) return "data";
  if (/ident|nif|cc|cartao de cidadao|seguranca|refer|processo|id/.test(s)) return "identificador";
  if (/contact|telef|email|phone/.test(s)) return "contacto";
  if (/morad|endere|address/.test(s)) return "morada";
  if (/saude|health|medic|diagn|seropos|hiv|genet/.test(s)) return "saude";
  if (/financ|cart|credit|rend|cvv|apolice|banc/.test(s)) return "financeiro";
  if (/biom|altura|peso|sangu/.test(s)) return "biometrico";
  if (/relig|etni|rac|origem/.test(s)) return "religiao_etnia";
  return "outro";
}

export interface Span { start: number; end: number; entity: Entity }

/** Find all occurrences of each entity in text; longer entities win over overlapping shorter ones. */
export function findSpans(text: string, entities: Entity[]): Span[] {
  const spans: Span[] = [];
  const sorted = [...entities].sort((a, b) => b.text.length - a.text.length);
  const taken = new Uint8Array(text.length);
  for (const e of sorted) {
    const needle = e.text.trim();
    if (!needle) continue;
    let from = 0;
    while (true) {
      const i = text.indexOf(needle, from);
      if (i < 0) break;
      const end = i + needle.length;
      let free = true;
      for (let k = i; k < end; k++) if (taken[k]) { free = false; break; }
      if (free) {
        for (let k = i; k < end; k++) taken[k] = 1;
        spans.push({ start: i, end, entity: e });
      }
      from = i + 1;
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** Strict hackathon format: each word of a sensitive span -> single "*", empty lines removed. */
export function anonymize(text: string, entities: Entity[]): string {
  const spans = findSpans(text, entities.filter((e) => e.enabled));
  let out = "";
  let cur = 0;
  for (const s of spans) {
    out += text.slice(cur, s.start);
    const segment = text.slice(s.start, s.end);
    out += segment
      .split("\n")
      .map((line) => line.split(/\s+/).filter(Boolean).map(() => "*").join(" "))
      .join("\n");
    cur = s.end;
  }
  out += text.slice(cur);
  return out
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0)
    .join("\n");
}

export function partialMask(t: string): string {
  return t
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length <= 2 ? "*".repeat(w.length) : w.slice(0, 2) + "*".repeat(Math.min(w.length - 2, 3))))
    .join(" ");
}

export function wordCount(t: string) {
  return t.split(/\s+/).filter(Boolean).length;
}

export function stats(text: string, entities: Entity[]) {
  const enabled = entities.filter((e) => e.enabled);
  const spans = findSpans(text, enabled);
  const maskedWords = spans.reduce((n, s) => n + wordCount(text.slice(s.start, s.end)), 0);
  const total = wordCount(text) || 1;
  const perCat: Record<string, number> = {};
  for (const e of enabled) perCat[e.category] = (perCat[e.category] ?? 0) + 1;
  const special = ["saude", "biometrico", "religiao_etnia"].some((c) => perCat[c]);
  const risk = special || enabled.length > 15 ? "Alto" : enabled.length > 5 ? "Médio" : enabled.length ? "Baixo" : "Nenhum";
  return { count: enabled.length, perCat, pct: Math.round((maskedWords / total) * 100), risk };
}

export const SAMPLE = `Relatório de Admissão - Centro Médico Lisboa
Data: 15 de abril de 2025
Referência: ADM-2025-04-15-089
Informações do Paciente:
Nome: Maria Conceição Oliveira Santos
Data de Nascimento: 12/03/1978
Sexo: Feminino
NIF: 097865413
Cartão de Cidadão: 12345678-9ZX0
Morada: Rua das Flores, 123, Apt 45, Sacavém, Lisboa
Telefone: +351 912 345 678
Email: maria.santos@emailpessoal.pt
Número da Segurança Social: 11223344556
Histórico Médico:
A paciente Maria Santos, mulher caucasiana de 47 anos, compareceu à consulta relatando dores abdominais intensas. Tem histórico de hipertensão e diabetes tipo 2, diagnosticada há 5 anos. É HIV positivo desde 2018, atualmente com carga viral indetectável graças ao tratamento com antirretrovirais.
Informações Financeiras:
Número do cartão de crédito: 4111 2222 3333 4444 (validade 09/27, CVV 123)
Rendimento anual declarado: €62.500
Contatos de Emergência:
Nome: António Santos (irmão)
Telefone: +351961234567
Email: antonio.santos@emailpessoal.pt`;
