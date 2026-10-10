import { useRef, useState } from "react";
import { FileText, ShieldCheck, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";
import { UI } from "@/lib/i18n-ui";

interface Props {
  text: string; name: string; dragging: boolean; reading: boolean;
  onText: (text: string) => void; onFile: (file: File) => void;
  onClear: () => void; onAnalyze: () => void;
}
export function DocumentInput({ text, name, dragging, reading, onText, onFile, onClear, onAnalyze }: Props) {
  const { t, s } = useSettings();
  const u = UI[s.lang];
  const [paste, setPaste] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  return (
    <section className="animate-fade-up mx-auto max-w-3xl">
      <input ref={input} type="file" aria-label={u.chooseFile} accept=".txt,.pdf,text/plain,application/pdf" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = "";
      }} />
      {!text.trim() && <>
        <div className={`document-dropzone flex min-h-72 flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed bg-card px-5 py-10 text-center sm:min-h-80 ${dragging ? "document-dropzone-active border-primary" : "border-border"}`} aria-busy={reading}>
          <div className="grid size-16 place-items-center rounded-full bg-primary/10 text-primary"><Upload className="size-7" aria-hidden="true" /></div>
          <div><h2 className="text-xl font-semibold sm:text-2xl">{u.dropTitle}</h2><p className="mt-2 text-sm text-muted-foreground">{u.fileTypes}</p></div>
          <Button onClick={() => input.current?.click()} disabled={reading}><Upload className="size-4" />{reading ? u.readingFile : u.chooseFile}</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          <Button variant="link" aria-expanded={paste} aria-controls="document-paste" onClick={() => { setPaste((p) => !p); requestAnimationFrame(() => textarea.current?.focus()); }}>{u.pasteText}</Button>
        </div>
      </>}
      <div id="document-paste" className={`document-expand ${paste || !!text.trim() ? "document-expand-open" : ""}`} inert={!paste && !text.trim()}>
        <div className="-m-1 min-h-0 overflow-hidden p-1">
          {text.trim() && <div className="mb-3 flex min-w-0 items-center gap-3 rounded-lg border bg-card px-3 py-2">
            <FileText className="size-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{name || u.pastedText}</p><p className="text-xs text-muted-foreground">{text.split(/\s+/).filter(Boolean).length} {t.words}</p></div>
            <Button variant="ghost" size="icon" aria-label={u.clearFile} title={u.clearFile} onClick={() => { onClear(); setPaste(false); }}><X className="size-4" /></Button>
          </div>}
          <textarea ref={textarea} value={text} aria-label={t.original} onChange={(e) => onText(e.target.value)} placeholder={t.placeholder} className="min-h-64 w-full resize-y rounded-lg border bg-card p-4 font-mono text-base leading-7 outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40 sm:min-h-80 sm:text-sm" />
          <div className="mt-4 flex justify-end"><Button onClick={onAnalyze} disabled={!text.trim() || reading}><ShieldCheck className="size-4" />{t.anonymize}</Button></div>
        </div>
      </div>
    </section>
  );
}