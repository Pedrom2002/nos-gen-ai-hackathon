const written: { uri: string; content?: string }[] = [];

jest.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///cache/" } },
  File: class {
    uri: string;
    exists = false;
    content?: string;
    constructor(_dir: unknown, name: string) {
      this.uri = `file:///cache/${name}`;
      written.push(this);
    }
    write(content: string) { this.content = content; }
    delete() {}
  },
}));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn(async () => {}) }));

import * as Sharing from "expo-sharing";

import { shareText } from "@/share";

test("writes submission.txt with a final newline and shares it as text", async () => {
  await shareText("submission.txt", "Nome: * *\nNIF: *");
  expect(written.at(-1)).toMatchObject({ uri: "file:///cache/submission.txt", content: "Nome: * *\nNIF: *\n" });
  expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/submission.txt", expect.objectContaining({ mimeType: "text/plain" }));
});

test("keeps an existing final newline", async () => {
  await shareText("relatorio.md", "# Relatório\n", "text/markdown");
  expect(written.at(-1)?.content).toBe("# Relatório\n");
});
