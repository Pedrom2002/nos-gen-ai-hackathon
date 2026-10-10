import { anonymize } from "@web/lib/anonymizer";
import { fromState } from "@web/lib/api-model";
import { UI } from "@web/lib/i18n-ui";

test("the shared web logic runs in the app", () => {
  const ana = { id: "1", text: "Ana Correia", category: "nome" as const, reason: "", gdpr_basis: "", enabled: true };
  expect(anonymize("Nome: Ana Correia", [ana])).toBe("Nome: * *");
  expect(UI.pt.downloadRedacted).toBe("Descarregar ficheiro censurado");
  expect(typeof fromState).toBe("function");
});
