import { useRef, useState } from "react";
import { ChevronDown, ClipboardPaste, ScanText, ShieldCheck, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";
import { UI } from "@/lib/i18n-ui";
import { ACCEPT, BADGES } from "@/lib/files";
import type { SourceKind } from "@/lib/document";
import type { ReadProgress } from "@/lib/source";

interface Props {
  text: string; name: string; dragging: boolean;
  /** What the import is doing right now, or null when idle. */
  busy: ReadProgress | null;
  /** Thumbnail of the loaded file, when it has one. */
  preview: string | null;
  kind: SourceKind | null;
  /** The text came from OCR and deserves a look before the analysis. */
  ocr: boolean;
  onText: (text: string) => void; onFile: (file: File) => void;
  onClear: () => void; onAnalyze: () => void;
}
export function DocumentInput({ text, name, dragging, busy, preview, kind, ocr, onText, onFile, onClear, onAnalyze }: Props) {
  const { t, s } = useSettings();
  const u = UI[s.lang];
  const [paste, setPaste] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const reading = !!busy;
  const pct = busy?.stage === "ocr" ? Math.round(busy.pct * 100) : null;
  const buttonLabel = pct !== null ? u.ocrProgress.replace("{pct}", String(pct)) : reading ? u.readingFile : u.chooseFile;
  // A DOCX is read by the backend, so it can be analysed before any text shows.
  const ready = !!text.trim() || kind === "docx";
  const loaded = ready || !!preview;
  const bigPreview = kind === "image" && preview;
  return (
    <section className="animate-fade-up mx-auto my-auto w-full max-w-4xl">
      <input ref={input} type="file" aria-label={u.chooseFile} accept={ACCEPT} className="hidden" onChange={(e) => {
        const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = "";
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
              {pct !== null && <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={u.ocrProgress.replace("{pct}", String(pct))} className="h-1 w-full overflow-hidden rounded-full bg-primary/20"><div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>}
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
                : <span className="document-sheet document-sheet-mini shrink-0" aria-hidden="true"><span className="document-line w-3/4" /><span className="document-line w-full"><span className="document-redact" /></span><span className="document-line w-1/2" /></span>}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold leading-tight">{name || u.pastedText}</h2>
                <p className="mt-1 flex items-center gap-2 text-xs empty:hidden text-muted-foreground">
                  {name.includes(".") && <span className="rounded-sm border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]">{name.split(".").pop()}</span>}
                  {text.trim() && <span className="tabular-nums">{text.split(/\s+/).filter(Boolean).length} {t.words}</span>}
                </p>
              </div>
              {loaded && <Button variant="ghost" size="icon" className="size-9 shrink-0 text-muted-foreground" aria-label={u.clearFile} title={u.clearFile} onClick={() => { onClear(); setPaste(false); }}><X className="size-4" /></Button>}
            </div>
            <div className="relative space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
              {ocr && <p className="flex items-start gap-2 rounded-md border border-amber-600/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"><ScanText className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{u.scannedNotice}</p>}
              <div className={bigPreview ? "grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : ""}>
                {bigPreview && <div className="overflow-hidden rounded-lg border bg-muted/40"><img src={preview} alt={name} className="mx-auto max-h-64 w-full object-contain sm:max-h-80" /></div>}
                <div className="overflow-hidden rounded-lg border bg-background/80">
                  <textarea ref={textarea} value={text} aria-label={t.original} onChange={(e) => onText(e.target.value)} placeholder={t.placeholder} className="block min-h-64 w-full resize-y bg-transparent px-4 py-3.5 font-mono text-base leading-7 outline-none placeholder:text-muted-foreground sm:min-h-80 sm:text-[13px]" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="lg" onClick={onAnalyze} disabled={!ready || reading}><ShieldCheck className="size-4" />{t.anonymize}</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
