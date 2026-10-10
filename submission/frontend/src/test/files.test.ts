import { describe, it, expect } from "vitest";
import { ACCEPT, BADGES, MAX_LOCAL_BYTES, kindOf, validateFile } from "@/lib/files";

describe("kindOf", () => {
  it("trusts the MIME type first", () => {
    expect(kindOf({ name: "x.bin", type: "application/pdf" })).toBe("pdf");
    expect(kindOf({ name: "x.bin", type: "image/jpeg" })).toBe("image");
    expect(kindOf({ name: "x.bin", type: "text/plain" })).toBe("text");
  });
  it("falls back to the extension when the browser gives no type", () => {
    expect(kindOf({ name: "scan.PNG", type: "" })).toBe("image");
    expect(kindOf({ name: "foto.jpeg", type: "" })).toBe("image");
    expect(kindOf({ name: "doc.pdf", type: "" })).toBe("pdf");
    expect(kindOf({ name: "nota.csv", type: "" })).toBe("text");
  });
  it("refuses what Lethe cannot open", () => {
    expect(kindOf({ name: "foto.heic", type: "image/heic" })).toBeNull();
    expect(kindOf({ name: "arquivo.docx", type: "" })).toBeNull();
    expect(kindOf({ name: "semextensao", type: "" })).toBeNull();
  });
});

describe("validateFile", () => {
  it("names the reason", () => {
    expect(validateFile({ name: "a.gif", type: "image/gif", size: 10 })).toEqual({ ok: false, reason: "type" });
    expect(validateFile({ name: "a.png", type: "image/png", size: MAX_LOCAL_BYTES + 1 })).toEqual({ ok: false, reason: "size" });
    expect(validateFile({ name: "a.png", type: "image/png", size: 10 })).toEqual({ ok: true, kind: "image" });
  });
});

describe("ACCEPT and BADGES", () => {
  it("advertise every format the validation opens", () => {
    for (const ext of [".pdf", ".txt", ".png", ".jpg", ".jpeg", ".webp"]) expect(ACCEPT.split(",")).toContain(ext);
    for (const mime of ["application/pdf", "text/plain", "image/png", "image/jpeg", "image/webp"]) expect(ACCEPT.split(",")).toContain(mime);
    for (const badge of BADGES) expect(kindOf({ name: `x.${badge}`, type: "" })).not.toBeNull();
  });
});
