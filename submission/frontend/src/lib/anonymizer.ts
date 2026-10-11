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
  at?: WordRange[] | undefined;   // exact positions from the backend
}

/** Words first..last (0-based, split on whitespace) of a 1-based line. */
export interface WordRange { line: number; first: number; last: number }

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

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Character range of a backend word range in text, or null if it does not fit. */
function rangeOf(text: string, at: WordRange): [number, number] | null {
  let offset = 0;
  const lines = text.split("\n");
  for (let n = 0; n < at.line - 1; n++) offset += (lines[n]?.length ?? 0) + 1;
  const line = lines[at.line - 1];
  if (line === undefined) return null;
  const words = [...line.matchAll(/\S+/g)];
  const a = words[at.first], b = words[at.last];
  if (!a || !b) return null;
  return [offset + a.index, offset + b.index + b[0].length];
}

/** True if text[start, end) is not glued to letters or digits ("Ana" is not in "Anabela"). */
function wholeWords(text: string, start: number, end: number): boolean {
  const before = text[start - 1], after = text[end];
  const first = text[start] ?? "", last = text[end - 1] ?? "";
  if (before && WORD_CHAR.test(first) && WORD_CHAR.test(before)) return false;
  if (after && WORD_CHAR.test(last) && WORD_CHAR.test(after)) return false;
  return true;
}

/**
 * Spans to mask. Entities from the backend use its exact positions, so a
 * value is masked where the backend found it and nowhere else. Entities
 * without positions (manual additions, demo mode) are found by text, on
 * whole words only; longer ones win over overlapping shorter ones.
 */
export function findSpans(text: string, entities: Entity[]): Span[] {
  const spans: Span[] = [];
  const taken = new Uint8Array(text.length);
  const claim = (start: number, end: number, entity: Entity) => {
    for (let k = start; k < end; k++) if (taken[k]) return;
    for (let k = start; k < end; k++) taken[k] = 1;
    spans.push({ start, end, entity });
  };
  const byText: Entity[] = [];
  for (const e of entities) {
    const ranges = (e.at ?? []).map((at) => rangeOf(text, at));
    if (ranges.length && ranges.every((r) => r !== null)) {
      for (const r of ranges) if (r) claim(r[0], r[1], e);
    } else byText.push(e);
  }
  for (const e of byText.sort((a, b) => b.text.length - a.text.length)) {
    const needle = e.text.trim();
    if (!needle) continue;
    for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) {
      if (wholeWords(text, i, i + needle.length)) claim(i, i + needle.length, e);
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

// Same edges as anonimizador/align.py: brackets and quotes before a word,
// closing brackets, quotes and punctuation after it.
const EDGE_PUNCT = /^([([\]"'«]*)(.*?)([)\]"'».,;:!?]*)$/s;

/** A masked word keeps its punctuation ("Flores," -> "*,"), as the backend does. */
function maskWord(word: string): string {
  const [, lead, core, trail] = EDGE_PUNCT.exec(word) ?? ["", "", word, ""];
  return core ? `${lead}*${trail}` : "*";
}

export interface Run { text: string; entityId?: string | undefined }

/** anonymize() as runs of text, each masked run tagged with its entity, so a view can point at one entity's "*". */
export function anonymizeRuns(text: string, entities: Entity[]): Run[] {
  const spans = findSpans(text, entities.filter((e) => e.enabled));
  let flat = "";
  const owner: (string | undefined)[] = [];
  const push = (s: string, entityId?: string) => { flat += s; for (let k = 0; k < s.length; k++) owner.push(entityId); };
  let cur = 0;
  for (const s of spans) {
    push(text.slice(cur, s.start));
    const segment = text.slice(s.start, s.end);
    push(segment
      .split("\n")
      .map((line) => line.split(/\s+/).filter(Boolean).map(maskWord).join(" "))
      .join("\n"), s.entity.id);
    cur = s.end;
  }
  push(text.slice(cur));
  // Trailing spaces cut and empty lines removed, keeping each character's owner.
  const runs: Run[] = [];
  const emit = (ch: string, entityId?: string) => {
    const last = runs[runs.length - 1];
    if (last && last.entityId === entityId) last.text += ch; else runs.push({ text: ch, entityId });
  };
  let first = true;
  for (let a = 0; a <= flat.length;) {
    let nl = flat.indexOf("\n", a);
    if (nl < 0) nl = flat.length;
    let b = nl > a && flat[nl - 1] === "\r" ? nl - 1 : nl;
    while (b > a && /\s/.test(flat.charAt(b - 1))) b--;
    if (flat.slice(a, b).trim()) {
      if (!first) emit("\n");
      first = false;
      for (let k = a; k < b; k++) emit(flat.charAt(k), owner[k]);
    }
    a = nl + 1;
  }
  return runs;
}

/** Hackathon format: each word of a sensitive span -> one "*" (punctuation kept), empty lines removed. */
export function anonymize(text: string, entities: Entity[]): string {
  return anonymizeRuns(text, entities).map((r) => r.text).join("");
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
