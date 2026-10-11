// The explanatory report: every masked value, its category and why, plus the
// totals and risk level computed by the web's shared stats.
import { findSpans, type CategoryId, type Entity, type stats } from "@web/lib/anonymizer";

export interface ReportRow {
  value: string;
  category: CategoryId;
  reason: string;
  basis: string;
  manual: boolean;
}

/** Masked values (kept ones left out), in the order they appear in the text. */
export function reportRows(text: string, entities: Entity[]): ReportRow[] {
  const masked = entities.filter((e) => e.enabled);
  const first = new Map<string, number>();
  for (const span of findSpans(text, masked)) {
    if (!first.has(span.entity.id)) first.set(span.entity.id, span.start);
  }
  return [...masked]
    .sort((a, b) => (first.get(a.id) ?? Infinity) - (first.get(b.id) ?? Infinity))
    .map((e) => ({ value: e.text, category: e.category, reason: e.reason, basis: e.gdpr_basis, manual: !!e.manual }));
}

export interface ReportLabels {
  entities: string;
  pctWords: string;
  risk: string;
  thEntity: string;
  thCategory: string;
  thReason: string;
  noEntities: string;
  manual: string;
  cats: Record<string, string>;
  riskNames: Record<string, string>;
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

export function reportMarkdown(
  title: string, summary: string, rows: ReportRow[], st: ReturnType<typeof stats>, labels: ReportLabels,
): string {
  const lines = [
    `# ${title}`, "",
    ...(summary ? [summary, ""] : []),
    `- ${labels.entities}: ${st.count}`,
    `- ${labels.pctWords}: ${st.pct}%`,
    `- ${labels.risk}: ${labels.riskNames[st.risk] ?? st.risk}`,
    "",
  ];
  if (!rows.length) return [...lines, labels.noEntities, ""].join("\n");
  lines.push(`| ${labels.thEntity} | ${labels.thCategory} | ${labels.thReason} |`, "| --- | --- | --- |");
  for (const r of rows) {
    const reason = r.manual ? `${r.reason || labels.manual}` : r.reason;
    lines.push(`| ${cell(r.value)} | ${cell(labels.cats[r.category] ?? r.category)} | ${cell(reason)} |`);
  }
  return [...lines, ""].join("\n");
}
