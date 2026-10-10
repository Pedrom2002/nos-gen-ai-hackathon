import { describe, it, expect } from "vitest";
import { anonymize, type Entity } from "@/lib/anonymizer";

const e = (text: string, enabled = true): Entity => ({ id: text, text, category: "outro", reason: "", gdpr_basis: "", enabled });

describe("anonymize", () => {
  it("replaces each word with a single *", () => {
    expect(anonymize("Nome: Maria Conceição Oliveira Santos", [e("Maria Conceição Oliveira Santos")])).toBe("Nome: * * * *");
    expect(anonymize("Telefone: +351 912 345 678", [e("+351 912 345 678")])).toBe("Telefone: * * * *");
    expect(anonymize("Email: maria.santos@emailpessoal.pt", [e("maria.santos@emailpessoal.pt")])).toBe("Email: *");
  });
  it("removes empty lines and skips disabled entities", () => {
    expect(anonymize("A Maria\n\nB Maria", [e("Maria", false)])).toBe("A Maria\nB Maria");
  });
});
