import { useRef, useState } from "react";
import { ChevronDown, ClipboardPaste, Plus, ShieldCheck, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";
import { UI } from "@/lib/i18n-ui";
import { ACCEPT, BADGES, MAX_BATCH_FILES } from "@/lib/files";
import type { Draft } from "@/lib/workspace";

interface Props {
  /** The files picked so far. One file keeps its editable text; several are listed and sent as they are. */
  drafts: Draft[];
  /** The editable text: of the single draft, or pasted. */
  text: string;
  dragging: boolean;
  onText: (text: string) => void; onFiles: (files: File[]) => void;
  onRemove: (key: string) => void;
  onClear: () => void; onAnalyze: () => void;
}

const MiniSheet = () => <span className="document-sheet document-sheet-mini shrink-0" aria-hidden="true"><span className="document-line w-3/4" /><span className="document-line w-full"><span className="document-redact" /></span><span className="document-line w-1/2" /></span>;

export function DocumentInput({ drafts, text, dragging, onText, onFiles, onRemove, onClear, onAnalyze }: Props) {
  const { t, s } = useSettings();
  const u = UI[s.lang];
  const [paste, setPaste] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const single = drafts.length === 1 ? drafts[0] : null;
  const many = drafts.length > 1;
  const name = single?.name ?? "";
  const busy = drafts.find((d) => d.busy)?.busy ?? null;
  const preview = single?.source?.previewUrl ?? null;
  const kind = single?.source?.kind ?? null;
  const reading = !!busy;
  const pct = busy?.stage === "ocr" ? Math.round(busy.pct * 100) : null;
  const buttonLabel = pct !== null ? u.ocrProgress.replace("{pct}", String(pct)) : reading ? u.readingFile : u.chooseFile;
  // A DOCX is read by the backend, so it can be analysed before any text shows.
  // Several files all go to the backend as they are, once each has been opened here.
  const ready = many ? drafts.every((d) => d.source) : (!!text.trim() || kind === "docx");
  const loaded = many || ready || !!preview;
  const bigPreview = !many && kind === "image" && preview;
  const full = drafts.length >= MAX_BATCH_FILES;
  const words = (value: string) => value.split(/\s+/).filter(Boolean).length;
  const progress = (value: number, label: string) => <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label} className="h-1 w-full overflow-hidden rounded-full bg-primary/20"><div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${value}%` }} /></div>;
  return (
    <section className="animate-fade-up mx-auto my-auto w-full max-w-4xl">
      <input ref={input} type="file" multiple aria-label={u.chooseFile} accept={ACCEPT} className="hidden" onChange={(e) => {
        const files = [...(e.target.files ?? [])]; if (files.length) onFiles(files); e.target.value = "";
      }} />
      {!loaded && <>
        <div className={`document-dropzone group relative overflow-hidden rounded-xl border-2 border-dashed bg-card px-5 py-16 text-center sm:py-24 ${dragging ? "document-dropzone-active border-primary" : "border-border hover:border-primary/60"}`} aria-busy={reading}>
          <div className="document-dropzone-glow pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="relative mx-auto flex max-w-md flex-col items-center gap-6">
            <div className="document-sheet document-sheet-lg relative" aria-hidden="true">
              <div className="space-y-2.5 px-5 pb-5 pt-6">
                <span className="document-line w-4/5" />
                <span className="document-line w-full"><span className="document-redact" /></span>
                <span className="document-line w-3/5" />
                <span className="document-line w-11/12"><span className="document-redact document-redact-late" /></span>
                <span className="document-line w-2/3" />
              </div>
              <span className="document-sheet-badge grid size-12 place-items-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-lg"><Upload className="size-5" /></span>
            </div>
            <div><h2 className="text-xl font-semibold sm:text-2xl">{u.dropTitle}</h2>
              <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
                {BADGES.map((b) => <span key={b} className="rounded-sm border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em]">{b}</span>)}
              </p></div>
            <div className="flex w-full max-w-xs flex-col items-center gap-3">
              <Button size="lg" onClick={() => input.current?.click()} disabled={reading}><Upload className="size-4" />{buttonLabel}</Button>
              {pct !== null && progress(pct, u.ocrProgress.replace("{pct}", String(pct)))}
            </div>
          </div>
        </div>
        <div className={`flex justify-center transition-[margin] ${paste ? "my-6" : "mt-6"}`}>
          <Button variant="ghost" className="gap-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary" aria-expanded={paste} aria-controls="document-paste" onClick={() => { setPaste((p) => !p); requestAnimationFrame(() => textarea.current?.focus()); }}><ClipboardPaste className="size-4" aria-hidden="true" />{u.pasteText}<ChevronDown className={`size-4 transition-transform ${paste ? "rotate-180" : ""}`} aria-hidden="true" /></Button>
        </div>
      </>}
      <div id="document-paste" className={`document-expand ${paste || loaded ? "document-expand-open" : ""}`} inert={!paste && !loaded}>
        <div className="-m-1 min-h-0 overflow-hidden p-1">
          <div className="document-dropzone group relative overflow-hidden rounded-xl border bg-card transition-colors focus-within:border-primary/70">
            <div className="document-dropzone-glow pointer-events-none absolute inset-0" aria-hidden="true" />
            <div className="relative flex min-w-0 items-center gap-4 px-5 py-4 sm:px-6">
              {preview && !bigPreview
                ? <img src={preview} alt="" className="size-11 shrink-0 rounded-md border object-cover" />
                : <MiniSheet />}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold leading-tight">{many ? u.filesQueued.replace("{n}", String(drafts.length)) : name || u.pastedText}</h2>
                <p className="mt-1 flex items-center gap-2 text-xs empty:hidden text-muted-foreground">
                  {!many && name.includes(".") && <span className="rounded-sm border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]">{name.split(".").pop()}</span>}
                  {!many && text.trim() && <span className="tabular-nums">{words(text)} {t.words}</span>}
                  {many && <span>{u.multiNoEdit}</span>}
                </p>
              </div>
              {loaded && <Button variant="ghost" size="icon" className="size-9 shrink-0 text-muted-foreground" aria-label={u.clearFile} title={u.clearFile} onClick={() => { onClear(); setPaste(false); }}><X className="size-4" /></Button>}
            </div>
            <div className="relative space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
              {many
                ? <ul aria-label={u.filesQueued.replace("{n}", String(drafts.length))} className="divide-y overflow-hidden rounded-lg border bg-background/80">
                  {drafts.map((d) => {
                    const ext = d.name.includes(".") ? d.name.split(".").pop() : "";
                    const ocr = d.busy?.stage === "ocr" ? Math.round(d.busy.pct * 100) : null;
                    return (
                      <li key={d.key} className="flex items-center gap-3 px-4 py-3" aria-busy={!!d.busy}>
                        {d.source?.previewUrl ? <img src={d.source.previewUrl} alt="" className="size-10 shrink-0 rounded-md border object-cover" /> : <MiniSheet />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{d.name}</p>
                          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            {ext && <span className="rounded-sm border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]">{ext}</span>}
                            {d.busy
                              ? <span role="status">{ocr !== null ? u.ocrProgress.replace("{pct}", String(ocr)) : u.readingFile}</span>
                              : d.text.trim() ? <span className="tabular-nums">{words(d.text)} {t.words}</span> : null}
                          </p>
                          {ocr !== null && <div className="mt-2">{progress(ocr, u.ocrProgress.replace("{pct}", String(ocr)))}</div>}
                        </div>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" aria-label={u.removeFile.replace("{name}", d.name)} title={u.removeFile.replace("{name}", d.name)} onClick={() => onRemove(d.key)}><X className="size-4" /></Button>
                      </li>
                    );
                  })}
                </ul>
                : <div className={bigPreview ? "grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : ""}>
                  {bigPreview && <div className="overflow-hidden rounded-lg border bg-muted/40"><img src={preview} alt={name} className="mx-auto max-h-64 w-full object-contain sm:max-h-80" /></div>}
                  <div className="overflow-hidden rounded-lg border bg-background/80">
                    <textarea ref={textarea} value={text} aria-label={t.original} onChange={(e) => onText(e.target.value)} placeholder={t.placeholder} className="block min-h-64 w-full resize-y bg-transparent px-4 py-3.5 font-mono text-base leading-7 outline-none placeholder:text-muted-foreground sm:min-h-80 sm:text-[13px]" />
                  </div>
                </div>}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => input.current?.click()} disabled={full || reading} title={full ? u.tooManyFiles.replace("{max}", String(MAX_BATCH_FILES)) : undefined}><Plus className="size-4" aria-hidden="true" />{u.addFiles}</Button>
                <Button size="lg" onClick={onAnalyze} disabled={!ready || reading}><ShieldCheck className="size-4" />{many ? u.analyzeN.replace("{n}", String(drafts.length)) : t.anonymize}</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
