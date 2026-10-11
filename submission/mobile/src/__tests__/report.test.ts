import { stats, type Entity } from "@web/lib/anonymizer";

import { reportMarkdown, reportRows } from "@/report";

const entity = (id: string, text: string, category: Entity["category"], enabled = true, manual = false): Entity =>
  ({ id, text, category, reason: `porque ${text}`, gdpr_basis: "Art. 4.º(1) RGPD", enabled, manual });

const LABELS = {
  entities: "Entidades", pctWords: "Palavras anonimizadas", risk: "Nível de risco",
  thEntity: "Entidade", thCategory: "Categoria", thReason: "Justificação",
  noEntities: "Nenhuma entidade detetada.", manual: "manual",
  cats: { nome: "Nome", contacto: "Contacto" } as Record<string, string>,
  riskNames: { Alto: "Alto", Médio: "Médio", Baixo: "Baixo", Nenhum: "Nenhum" } as Record<string, string>,
};

test("rows list masked values in reading order and mark manual ones", () => {
  const text = "Email rui@x.pt\nNome: Rui Costa";
  const ents = [entity("1", "Rui Costa", "nome"), entity("2", "rui@x.pt", "contacto"), entity("3", "Lisboa", "outro", false), entity("4", "Costa", "nome", true, true)];
  const rows = reportRows(text, ents);
  expect(rows.map((r) => r.value)).toEqual(["rui@x.pt", "Rui Costa", "Costa"]);
  expect(rows[2]).toMatchObject({ manual: true, category: "nome" });
});

test("the Markdown report has totals, risk and one row per value", () => {
  const text = "Nome: Rui Costa, email rui@x.pt";
  const ents = [entity("1", "Rui Costa", "nome"), entity("2", "rui@x.pt", "contacto")];
  const md = reportMarkdown("Relatório", "Resumo da API.", reportRows(text, ents), stats(text, ents), LABELS);
  expect(md).toContain("# Relatório");
  expect(md).toContain("Resumo da API.");
  expect(md).toContain("Entidades: 2");
  expect(md).toContain("Nível de risco: Baixo");
  expect(md).toContain("| Rui Costa | Nome | porque Rui Costa |");
  expect(md.split("\n").filter((l: string) => l.startsWith("| ") && !l.startsWith("| Entidade") && !l.startsWith("| ---"))).toHaveLength(2);
});

test("a document with nothing detected still gives a report", () => {
  const md = reportMarkdown("Relatório", "", reportRows("Sem dados", []), stats("Sem dados", []), LABELS);
  expect(md).toContain("Nível de risco: Nenhum");
  expect(md).toContain("Nenhuma entidade detetada.");
});
