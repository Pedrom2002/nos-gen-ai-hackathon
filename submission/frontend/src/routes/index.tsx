import { LetheWordmark } from "@/components/LetheLogo";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, AlertTriangle, RotateCw, X } from "lucide-react";
import { DocumentInput } from "@/components/DocumentInput";
import { DocumentTabs } from "@/components/DocumentTabs";
import { DocumentWorkspace } from "@/components/DocumentWorkspace";
import { ReviewSkeleton } from "@/components/ReviewSkeleton";
import type { SourceKind } from "@/lib/document";
import { MAX_BATCH_FILES, MAX_UPLOAD_BYTES, validateFile } from "@/lib/files";
import { disposeSource, readSource } from "@/lib/source";
import { terminateOcr } from "@/lib/ocr";
import { UI } from "@/lib/i18n-ui";
import { draftKey, type DocStatus, type Draft, type FailedFile, type OpenDoc } from "@/lib/workspace";
import { analyzeDocument, analyzeDocuments, deleteDocument, downloadZip, isMockMode } from "@/services/anonymizer";
import { SettingsSheet } from "@/components/SettingsSheet";
import { Button } from "@/components/ui/button";
import { SettingsProvider, useSettings } from "@/lib/settings";
import { EXTRA } from "@/lib/i18n-extra";
import { IntroAnimation } from "@/components/IntroAnimation";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `Lethe — ${EXTRA.pt.subtitle}` },
      { name: "description", content: EXTRA.pt.subtitle },
      { property: "og:title", content: `Lethe — ${EXTRA.pt.subtitle}` },
      { property: "og:description", content: EXTRA.pt.subtitle },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <SettingsProvider><Index /></SettingsProvider>,
});

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/**
 * The page: the intake (step 0), then one workspace per analysed document,
 * with a tab strip when there are several. Each workspace owns its review
 * and result; this shell owns the files before the analysis and the list
 * of open documents.
 */
function Index() {
  // The files picked or dropped and not yet analysed. While a file is being
  // read, its text and pages arrive here; a lone file's text can be edited.
  const [drafts, setDrafts] = useState<Draft[]>([]);
  // Async readers and the drop handler need the current list, not the one
  // their render captured.
  const draftsRef = useRef<Draft[]>([]);
  const updateDrafts = (fn: (ds: Draft[]) => Draft[]) => setDrafts((ds) => (draftsRef.current = fn(ds)));
  const [text, setText] = useState("");
  const [docs, setDocs] = useState<OpenDoc[]>([]);
  const [activeKey, setActiveKey] = useState("");
  const [status, setStatus] = useState<Record<string, DocStatus>>({});
  const [failed, setFailed] = useState<FailedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [zipping, setZipping] = useState(false);
  // Raised by "Generate" in any tab: every document still in review generates its result.
  const [generateAll, setGenerateAll] = useState(0);
  const [error, setError] = useState("");
  const { t, s: cfg } = useSettings();
  const x = EXTRA[cfg.lang];
  const u = UI[cfg.lang];
  const STEPS = t.steps;
  // The stepper follows the document on screen; the analysis itself shows as step 1.
  const step = loading ? 1 : docs.length ? (status[activeKey]?.step ?? 1) : 0;
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step === 0, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchDraft = (key: string, patch: Partial<Draft>) => updateDrafts((ds) => ds.map((d) => d.key === key ? { ...d, ...patch } : d));
  const removeDraft = (key: string) => {
    disposeSource(draftsRef.current.find((d) => d.key === key)?.source ?? null);
    updateDrafts((ds) => ds.filter((d) => d.key !== key));
    const rest = draftsRef.current;
    if (rest.length <= 1) setText(rest[0]?.text ?? "");
  };
  // Files are opened one after another: the OCR worker is one, and a photo
  // is heavy. Each shows in the list at once, with its progress.
  const queue = useRef(Promise.resolve());
  const handleFiles = (files: File[]) => {
    const accepted: { key: string; file: File; kind: SourceKind }[] = [];
    for (const f of files) {
      const check = validateFile(f);
      if (!check.ok) { toast.error(check.reason === "size" ? u.fileTooLarge.replace("{name}", f.name).replace("{max}", "25") : u.invalidFile); continue; }
      accepted.push({ key: draftKey(), file: f, kind: check.kind });
    }
    const room = MAX_BATCH_FILES - draftsRef.current.length;
    if (accepted.length > room) { toast.error(u.tooManyFiles.replace("{max}", String(MAX_BATCH_FILES))); accepted.splice(Math.max(0, room)); }
    if (!accepted.length) return;
    updateDrafts((ds) => [...ds, ...accepted.map((a) => ({ key: a.key, name: a.file.name, source: null, text: "", busy: { stage: "reading" as const, pct: 0 } }))]);
    setError("");
    for (const a of accepted) {
      queue.current = queue.current.then(async () => {
        const still = () => draftsRef.current.some((d) => d.key === a.key);
        if (!still()) return;
        try {
          const doc = await readSource(a.file, a.kind, (p) => patchDraft(a.key, { busy: p }));
          if (!still()) { disposeSource(doc); return; }
          patchDraft(a.key, { source: doc, text: doc.text, busy: null });
          if (draftsRef.current.length === 1) {
            setText(doc.text);
            if (!doc.text.trim() && doc.kind !== "docx") { toast.info(doc.ocr ? u.ocrEmpty : x.emptyDoc); return; }
          }
          toast.success(u.fileLoaded.replace("{name}", a.file.name));
        } catch (e) {
          console.error(e);
          toast.error(x.readFail);
          removeDraft(a.key);
        }
      });
    }
  };

  const open = (opened: OpenDoc[], failures: FailedFile[]) => {
    const kept = new Set(opened.map((d) => d.key));
    for (const d of draftsRef.current) if (!kept.has(d.key)) disposeSource(d.source);
    updateDrafts(() => []);
    setFailed(failures);
    setStatus({});
    setDocs(opened);
    setActiveKey(opened[0]?.key ?? "");
  };

  const run = async () => {
    const list = draftsRef.current;
    const fail = (e: unknown) => { console.error(e); setError(e instanceof Error ? e.message : x.unknownErr); };
    if (list.length <= 1) {
      const draft = list[0] ?? null;
      const source = draft?.source ?? null;
      if (!text.trim() && source?.kind !== "docx") { toast.error(x.emptyDoc); return; }
      setLoading(true);
      setError("");
      try {
        // The file itself goes up while its text is untouched; edited text goes as text.
        const raw = !!source && source.text === text && source.file.size <= MAX_UPLOAD_BYTES;
        let r;
        try {
          r = await analyzeDocument(text, raw ? source.file : null);
        } catch (e) {
          // A server without OCR refuses photos and scans: send what this browser read.
          const noOcr = e instanceof Error && e.message.includes("OCR");
          if (!(raw && source.ocr && text.trim() && noOcr)) throw e;
          toast.info(u.ocrFallback);
          r = await analyzeDocument(text, null);
        }
        open([{ key: draft?.key ?? draftKey(), name: draft?.name ?? u.pastedText, source, result: r }], []);
      } catch (e) { fail(e); } finally { setLoading(false); }
      return;
    }
    if (list.some((d) => !d.source)) return;
    setLoading(true);
    setError("");
    try {
      // Several files go as they are, in one request; each gets its own answer.
      const entries = await analyzeDocuments(list.flatMap((d) => d.source ? [d.source.file] : []));
      const opened: OpenDoc[] = [], failures: FailedFile[] = [];
      list.forEach((d, i) => {
        const entry = entries[i];
        if (entry?.result) opened.push({ key: d.key, name: d.name, source: d.source, result: entry.result });
        else failures.push({ name: d.name, error: entry?.error ?? x.unknownErr });
      });
      if (!opened.length) { setError(failures.map((f) => `${f.name}: ${f.error}`).join("\n")); return; }
      open(opened, failures);
    } catch (e) { fail(e); } finally { setLoading(false); }
  };

  const forget = (list: OpenDoc[]) => {
    for (const d of list) {
      disposeSource(d.source);
      // The backend keeps documents in memory until they are deleted.
      if (d.result.docId) void deleteDocument(d.result.docId).catch(() => {});
    }
  };
  // "Back" from a review: the files return to the intake for another analysis.
  const reopen = () => {
    const back: Draft[] = docs.map((d) => ({ key: d.key, name: d.name, source: d.source, text: d.result.text, busy: null }));
    for (const d of docs) if (d.result.docId) void deleteDocument(d.result.docId).catch(() => {});
    setDocs([]); setStatus({}); setActiveKey(""); setFailed([]);
    updateDrafts(() => back);
    setText(back.length === 1 ? back[0]?.text ?? "" : "");
  };
  const home = () => {
    forget(docs);
    for (const d of draftsRef.current) disposeSource(d.source);
    updateDrafts(() => []);
    setDocs([]); setStatus({}); setActiveKey(""); setFailed([]);
    setText(""); setError("");
    // The OCR worker and its models are only worth keeping while a document is open.
    void terminateOcr();
  };
  const closeDoc = (key: string) => {
    const index = docs.findIndex((d) => d.key === key);
    const doc = docs[index];
    if (!doc) return;
    const rest = docs.filter((d) => d.key !== key);
    if (!rest.length) { home(); return; }
    forget([doc]);
    setDocs(rest);
    setStatus((s) => { const next = { ...s }; delete next[key]; return next; });
    if (activeKey === key) setActiveKey(rest[Math.min(index, rest.length - 1)]?.key ?? "");
  };
  const statusOf = (key: string) => (s: DocStatus) => setStatus((prev) => {
    const old = prev[key];
    return old && old.step === s.step && old.finishing === s.finishing ? prev : { ...prev, [key]: s };
  });
  const downloadAll = async () => {
    setZipping(true);
    try {
      const { blob, filename } = await downloadZip(docs.flatMap((d) => d.result.docId ? [d.result.docId] : []));
      saveBlob(blob, filename);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : x.unknownErr);
    } finally { setZipping(false); }
  };

  // Page-wide file dropping; text selections are never treated as files.
  useEffect(() => {
    let depth = 0;
    const hasFile = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => { if (!hasFile(e)) return; e.preventDefault(); depth++; if (!loading) setDragging(true); };
    const over = (e: DragEvent) => { if (hasFile(e)) e.preventDefault(); };
    const leave = (e: DragEvent) => { if (!hasFile(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const drop = (e: DragEvent) => { if (!hasFile(e)) return; e.preventDefault(); depth = 0; setDragging(false); const files = [...(e.dataTransfer?.files ?? [])]; if (files.length && !loading) handleFiles(files); };
    const reset = () => { depth = 0; setDragging(false); };
    window.addEventListener("dragenter", enter); window.addEventListener("dragover", over); window.addEventListener("dragleave", leave); window.addEventListener("drop", drop); window.addEventListener("blur", reset);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); window.removeEventListener("blur", reset); };
  }, [loading, cfg.lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.title = `Lethe — ${x.subtitle}`;
    for (const selector of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]']) {
      document.querySelector(selector)?.setAttribute("content", selector.includes("og:title") ? document.title : x.subtitle);
    }
  }, [x.subtitle]);

  return (
    <div>
      <IntroAnimation />
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <header className="bg-card">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <nav className="grid h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <LetheWordmark id="lethe-header-logo" className="h-9 shrink-0" />
                {/* Without VITE_API_URL the results are canned: say so, so a demo never passes for the real model. */}
                {isMockMode && <span role="status" title={u.demoMode} className="min-w-0 truncate rounded-md border border-amber-600/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">{u.demoMode}</span>}
              </div>
              <SettingsSheet />
            </nav>
            <div aria-hidden="true" className="h-px bg-border" />
          </div>
        </header>

        <main className={`mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col px-4 pt-6 sm:px-6 sm:pt-8 ${step === 1 ? "pb-40 lg:pb-16" : "pb-16"}`}>
          <h1 className="sr-only">{STEPS[step]}</h1>
          <div className="mb-8 flex min-w-0 justify-center">
            <ol aria-label={STEPS.join(" · ")} className="flex w-full max-w-2xl min-w-0 items-center">
              {STEPS.map((s, i) => (
                <li key={s} aria-current={i === step ? "step" : undefined} className="flex min-w-0 flex-1 items-center gap-3 last:flex-none">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold transition-colors ${i < step ? "border-primary bg-primary text-primary-foreground" : i === step ? "border-primary bg-primary/10 text-primary ring-4 ring-primary/15 step-current" : "border-border bg-card text-muted-foreground"}`}>
                    {i < step ? <Check className="step-check size-4" /> : i + 1}
                  </span>
                  <span className={`${i === step ? "inline font-semibold text-foreground" : "hidden text-muted-foreground md:inline"} min-w-0 truncate text-sm`}>{s}</span>
                  {i < STEPS.length - 1 && <span aria-hidden="true" className="relative h-0.5 min-w-4 flex-1 overflow-hidden rounded-full bg-border"><span className={`absolute inset-y-0 left-0 bg-primary transition-[width] duration-500 ${i < step ? "w-full" : "w-0"}`} /></span>}
                </li>
              ))}
            </ol>
          </div>

          {step === 0 && error && (
            <section role="alert" className="mx-auto mb-6 w-full max-w-3xl rounded-lg border border-destructive/30 bg-card p-5 animate-fade-up">
              <div className="flex items-start gap-3"><AlertTriangle className="mt-1 size-6 shrink-0 text-destructive" /><div className="min-w-0"><h2 className="font-semibold">{u.errorTitle}</h2><p className="mt-2 whitespace-pre-line break-words text-sm text-muted-foreground">{error}</p></div></div>
              <div className="mt-5 flex flex-wrap gap-2"><Button onClick={run}><RotateCw className="size-4" />{u.retry}</Button><Button variant="outline" onClick={home}>{u.home}</Button></div>
            </section>
          )}

          {step === 0 && !error && (
            <DocumentInput drafts={drafts} text={text} dragging={dragging} onFiles={handleFiles} onRemove={removeDraft} onText={(value) => { setText(value); setError(""); }} onClear={home} onAnalyze={run} />
          )}

          {loading && <ReviewSkeleton />}

          {!loading && docs.length > 0 && (
            <>
              {failed.length > 0 && (
                <section role="alert" className="mb-6 rounded-lg border border-amber-600/40 bg-amber-500/10 p-4 text-sm">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold">{u.failedFiles.replace("{n}", String(failed.length))}</h2>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        {failed.map((f) => <li key={f.name + f.error} className="break-words"><span className="font-medium text-foreground">{f.name}</span>: {f.error}</li>)}
                      </ul>
                    </div>
                    <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={u.close} title={u.close} onClick={() => setFailed([])}><X className="size-4" /></Button>
                  </div>
                </section>
              )}
              {docs.length > 1 && <DocumentTabs docs={docs} activeKey={activeKey} status={status} onSelect={setActiveKey} onClose={closeDoc} onDownloadAll={isMockMode ? undefined : downloadAll} downloading={zipping} />}
              {docs.map((d) => <DocumentWorkspace key={d.key} doc={d} active={d.key === activeKey} onStatus={statusOf(d.key)} onBack={reopen} onHome={home} onGenerate={() => setGenerateAll((n) => n + 1)} generateAll={generateAll} generateLabel={docs.length > 1 ? u.generateAll : t.generate} />)}
            </>
          )}
        </main>

        {dragging && <div aria-hidden="true" className="pointer-events-none fixed inset-3 z-40 grid place-items-center rounded-lg border-2 border-dashed border-primary bg-background/90 text-primary"><p className="px-5 text-center text-xl font-semibold">{u.dropTitle}</p></div>}
      </div>
    </div>
  );
}
