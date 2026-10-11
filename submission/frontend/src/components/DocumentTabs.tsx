import { useRef } from "react";
import { Archive, FileText, Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI } from "@/lib/i18n-ui";
import { useSettings } from "@/lib/settings";
import { allFinished, type DocStatus, type OpenDoc } from "@/lib/workspace";

interface Props {
  docs: OpenDoc[];
  activeKey: string;
  status: Record<string, DocStatus>;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  /** Absent when there is no backend to build the zip (demo mode). */
  onDownloadAll?: (() => void) | undefined;
  downloading?: boolean | undefined;
}

/**
 * The strip above the wizard when several documents are open: one tab per
 * document, with where it stands, and the zip of everything once all are done.
 */
export function DocumentTabs({ docs, activeKey, status, onSelect, onClose, onDownloadAll, downloading }: Props) {
  const { t, s } = useSettings();
  const u = UI[s.lang];
  const list = useRef<HTMLDivElement>(null);
  const done = allFinished(docs, status);
  const move = (from: number, delta: number) => {
    const next = docs[(from + delta + docs.length) % docs.length];
    if (!next) return;
    onSelect(next.key);
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-tab="${next.key}"]`)?.focus());
  };
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div ref={list} role="tablist" aria-label={u.documentTabs} className="flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1">
        {docs.map((d, i) => {
          const selected = d.key === activeKey;
          const st = status[d.key];
          const stage = t.steps[st?.step ?? 1] ?? "";
          const Icon = d.source?.kind === "image" ? ImageIcon : FileText;
          return (
            <div key={d.key} className={`flex shrink-0 items-center rounded-md transition-colors ${selected ? "bg-card shadow-sm" : "hover:bg-card/60"}`}>
              <button type="button" role="tab" data-tab={d.key} aria-selected={selected} tabIndex={selected ? 0 : -1} title={d.name}
                onClick={() => onSelect(d.key)}
                onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); move(i, 1); } else if (e.key === "ArrowLeft") { e.preventDefault(); move(i, -1); } }}
                className={`flex h-9 max-w-56 items-center gap-2 rounded-md pl-3 pr-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{d.name}</span>
                <span role="img" aria-label={stage} title={stage} className={`size-2 shrink-0 rounded-full ${st?.step === 2 ? (st.finishing ? "animate-pulse bg-primary" : "bg-success") : "bg-border"}`} />
              </button>
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={u.closeDocument.replace("{name}", d.name)} title={u.closeDocument.replace("{name}", d.name)} onClick={() => onClose(d.key)}><X className="size-3.5" /></Button>
            </div>
          );
        })}
      </div>
      {onDownloadAll && (
        <Button variant="outline" disabled={!done || !!downloading} title={done ? undefined : u.downloadAllWhen} onClick={onDownloadAll} className="gap-2">
          <Archive className="size-4" aria-hidden="true" />{u.downloadAll}
        </Button>
      )}
    </div>
  );
}
