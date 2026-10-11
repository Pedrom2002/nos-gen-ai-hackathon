import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DocumentTabs } from "@/components/DocumentTabs";
import { SettingsProvider } from "@/lib/settings";
import { allFinished, type DocStatus, type OpenDoc } from "@/lib/workspace";

const doc = (key: string, name: string, docId = key): OpenDoc => ({
  key, name, source: null,
  result: { docId, text: "Nome: Rui", entities: [], summary: "" },
});
const docs = [doc("a", "ficha.pdf"), doc("b", "foto.png"), doc("c", "nota.txt")];
const review: DocStatus = { step: 1, finishing: false };
const done: DocStatus = { step: 2, finishing: false };

function mount(status: Record<string, DocStatus>, extra: Partial<Parameters<typeof DocumentTabs>[0]> = {}) {
  const onSelect = vi.fn(), onClose = vi.fn(), onDownloadAll = vi.fn();
  render(<SettingsProvider><DocumentTabs docs={docs} activeKey="a" status={status} onSelect={onSelect} onClose={onClose} onDownloadAll={onDownloadAll} {...extra} /></SettingsProvider>);
  return { onSelect, onClose, onDownloadAll };
}

describe("DocumentTabs", () => {
  it("shows a tab per document and selects on click", () => {
    const { onSelect } = mount({ a: review, b: review, c: review });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["ficha.pdf", "foto.png", "nota.txt"].map((n) => expect.stringContaining(n)));
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.click(tabs[1]!);
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("moves between tabs with the arrow keys", () => {
    const { onSelect } = mount({ a: review, b: review, c: review });
    fireEvent.keyDown(screen.getAllByRole("tab")[0]!, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenCalledWith("b");
    fireEvent.keyDown(screen.getAllByRole("tab")[0]!, { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("closes a document from its tab", () => {
    const { onClose } = mount({ a: review, b: review, c: review });
    fireEvent.click(screen.getByRole("button", { name: /foto\.png/ }));
    expect(onClose).toHaveBeenCalledWith("b");
  });

  it("offers the zip only once every document has its result", () => {
    const { onDownloadAll } = mount({ a: done, b: done, c: review });
    const zip = screen.getByRole("button", { name: /zip/i });
    expect(zip).toBeDisabled();
    fireEvent.click(zip);
    expect(onDownloadAll).not.toHaveBeenCalled();
  });

  it("downloads everything when all are done", () => {
    const { onDownloadAll } = mount({ a: done, b: done, c: done });
    fireEvent.click(screen.getByRole("button", { name: /zip/i }));
    expect(onDownloadAll).toHaveBeenCalledTimes(1);
  });

  it("hides the zip without a backend", () => {
    mount({ a: done, b: done, c: done }, { onDownloadAll: undefined });
    expect(screen.queryByRole("button", { name: /zip/i })).toBeNull();
  });
});

describe("allFinished", () => {
  it("needs every document generated, applied and known to the backend", () => {
    expect(allFinished(docs, { a: done, b: done, c: done })).toBe(true);
    expect(allFinished(docs, { a: done, b: { step: 2, finishing: true }, c: done })).toBe(false);
    expect(allFinished(docs, { a: done, b: done })).toBe(false);
    expect(allFinished([doc("d", "demo.txt", "")], { d: done })).toBe(false);
    expect(allFinished([], {})).toBe(false);
  });
});
