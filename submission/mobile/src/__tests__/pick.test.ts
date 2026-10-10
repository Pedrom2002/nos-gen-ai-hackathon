import { checkPicked, kindOfName, MAX_UPLOAD_BYTES, sizeLabel } from "@/pick";

test("knows the formats the API reads", () => {
  expect(kindOfName("a.JPG")).toBe("image");
  expect(kindOfName("a.webp")).toBe("image");
  expect(kindOfName("scan.pdf")).toBe("pdf");
  expect(kindOfName("a.docx")).toBe("docx");
  expect(kindOfName("a.csv")).toBe("text");
  expect(kindOfName("foto", "image/jpeg")).toBe("image");
  expect(kindOfName("a.heic")).toBeNull();
  expect(kindOfName("a.gif", "image/gif")).toBeNull();
});

test("refuses files the API would refuse, before uploading", () => {
  expect(checkPicked({ uri: "u", name: "a.pdf", type: "application/pdf", size: MAX_UPLOAD_BYTES + 1 })).toEqual({ ok: false, reason: "size" });
  expect(checkPicked({ uri: "u", name: "a.gif", type: "image/gif", size: 10 })).toEqual({ ok: false, reason: "type" });
  expect(checkPicked({ uri: "u", name: "a.pdf", type: "application/pdf", size: 10 })).toEqual({ ok: true, kind: "pdf" });
  // Pickers do not always report a size: let the API decide then.
  expect(checkPicked({ uri: "u", name: "a.png", type: "image/png" })).toEqual({ ok: true, kind: "image" });
});

test("says how big a refused file is", () => {
  expect(sizeLabel(26 * 1024 * 1024)).toBe("26 MB");
  expect(sizeLabel(512 * 1024)).toBe("0,5 MB");
});
