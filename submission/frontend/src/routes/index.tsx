import { LetheWordmark } from "@/components/LetheLogo";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowLeftRight, ArrowRight, Columns2, Copy, Download,
  FileDown, Check, AlertTriangle, RotateCw, SearchX, ShieldCheck, FileText, Image as ImageIcon,
} from "lucide-react";
import { DocumentInput } from "@/components/DocumentInput";
import { ReviewSkeleton } from "@/components/ReviewSkeleton";
import { RiverComparison } from "@/components/RiverComparison";
import { PageComparison } from "@/components/PageComparison";
import { PageStack } from "@/components/PageStack";
import { FocusedText } from "@/components/FocusedText";
import { usePageImages } from "@/hooks/usePageImages";
import type { SourceDoc } from "@/lib/document";
import { MAX_UPLOAD_BYTES, validateFile } from "@/lib/files";
import { disposeSource, readSource, type ReadProgress } from "@/lib/source";
import { terminateOcr } from "@/lib/ocr";
import { alignText, redactionBoxes } from "@/lib/redaction";
import { UI } from "@/lib/i18n-ui";
import { emptyHistory, reviewHistory } from "@/lib/review-history";
import { analyzeDocument, deleteDocument, downloadRedacted, isMockMode, syncDecisions } from "@/services/anonymizer";
import {
  CATEGORIES, anonymize, catOf, normalizeCategory, partialMask, stats,
  type CategoryId, type Entity,
} from "@/lib/anonymizer";
import { ReviewPanel } from "@/components/ReviewPanel";
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


function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function Index() {
  const [step, setStep] = useState(0);
  const [text, setText] = useState("");
  const [history, dispatch] = useReducer(reviewHistory, emptyHistory);
  const entities = history.present;
  const [fileName, setFileName] = useState("");
  // The last file loaded, with its text. While its text was not edited, the
  // file itself goes to the backend: it reads PDFs as run.py does, reads
  // photos and scans with its own OCR (straightened, misreads fixed), reads
  // DOCX, and can give the file back with the masked words removed.
  const [source, setSource] = useState<SourceDoc | null>(null);
  // The drop handler may hold an older render's handleFile, so it releases
  // the previous document through a ref rather than the captured state.
  const sourceRef = useRef<SourceDoc | null>(null);
  const replaceSource = (next: SourceDoc | null) => { disposeSource(sourceRef.current); sourceRef.current = next; setSource(next); };
  const [docId, setDocId] = useState("");
  // What the backend said about the file it read: whether it can return the
  // file redacted, and how many text lines its OCR could not read.
  const [redactable, setRedactable] = useState(false);
  const [unread, setUnread] = useState(0);
  const [redactedUrl, setRedactedUrl] = useState<string | null>(null);
  const showRedacted = (url: string | null) => setRedactedUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<ReadProgress | null>(null);
  const reading = busy !== null;
  const [resultView, setResultView] = useState<"side" | "slide">("slide");
  // Photos and PDFs can be shown as their pages, with the masked words
  // blacked out in place, or as text; plain text and DOCX only have text.
  const [docView, setDocView] = useState<"text" | "pages">("pages");
  const [sliderSeen, setSliderSeen] = useState(true);
  const [focusId, setFocusId] = useState("");
  const hasPages = (source?.pages.length ?? 0) > 0;
  const showPages = hasPages && docView === "pages";
  const pageUrls = usePageImages(source, step === 2 && hasPages);
  useEffect(() => { if (step !== 2) setFocusId(""); }, [step]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);
  useEffect(() => {
    if (!focusId) return;
    const mark = [...document.querySelectorAll<HTMLElement>("[data-focus-mark]")].find((m) => m.offsetParent !== null);
    mark?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusId, resultView, docView]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const { t, s: cfg } = useSettings();
  const x = EXTRA[cfg.lang];
  const u = UI[cfg.lang];
  const STEPS = t.steps;
  const [error, setError] = useState("");

  const output = useMemo(() => anonymize(text, entities), [text, entities]);
  const st = useMemo(() => stats(text, entities), [text, entities]);
  // The page boxes come from the same spans anonymize() masks. Aligning the
  // backend's text onto the page words read here is the slow part and
  // depends only on both texts, so it is memoised apart from the entities.
  const pages = useMemo(() => source?.pages ?? [], [source]);
  const alignment = useMemo(() => alignText(text, pages), [text, pages]);
  const redaction = useMemo(() => redactionBoxes(text, entities, pages, alignment), [text, entities, pages, alignment]);
  // A photo's redacted half is the file the backend built and verified; the
  // boxes drawn here only locate the focused entity on it.
  const redactedUrls = useMemo(() => (redactedUrl && source?.kind === "image" ? [redactedUrl] : []), [redactedUrl, source]);
  const unplaced = showPages && !redactedUrls.length ? redaction.unplaced : 0;

  const handleFile = async (f: File) => {
    const check = validateFile(f);
    if (!check.ok) {
      toast.error(check.reason === "size" ? u.fileTooLarge.replace("{name}", f.name).replace("{max}", "25") : u.invalidFile);
      return;
    }
    setBusy({ stage: "reading", pct: 0 });
    try {
      const doc = await readSource(f, check.kind, setBusy);
      setText(doc.text);
      replaceSource(doc);
      setFileName(f.name);
      setStep(0);
      setError("");
      if (!doc.text.trim() && doc.kind !== "docx") toast.info(doc.ocr ? u.ocrEmpty : x.emptyDoc); else toast.success(u.fileLoaded.replace("{name}", f.name));
    } catch (e) {
      console.error(e);
      toast.error(x.readFail);
    } finally { setBusy(null); }
  };

  const run = async () => {
    if (!text.trim() && source?.kind !== "docx") { toast.error(x.emptyDoc); return; }
    setLoading(true);
    setError("");
    setStep(1);
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
      if (docId) void deleteDocument(docId).catch(() => {});
      setDocId(r.docId ?? "");
      setRedactable(!!r.redactable);
      setUnread(r.unread ?? 0);
      showRedacted(null);
      // Show the document as the backend read it, so the highlights match its lines.
      setText(r.text);
      const seen = new Set<string>();
      const ents: Entity[] = [];
      r.entities.forEach((e, i) => {
        const t = e.text?.trim();
        if (!t || !r.text.includes(t) || seen.has(t)) return;
        seen.add(t);
        ents.push({ id: `ai-${i}`, text: t, category: normalizeCategory(e.category), reason: e.reason ?? "", gdpr_basis: e.gdpr_basis ?? "Art. 4.º(1) RGPD", enabled: true, role: e.role, refs: e.refs, at: e.at });
      });
      dispatch({ type: "reset", entities: ents });
      setResultView("side");
      setDocView("pages");
      setSliderSeen(false);
      setSummary(r.summary);
      setStep(1);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : x.unknownErr;
      setError(msg);
      setStep(0);
    } finally {
      setLoading(false);
    }
  };

  const commit = (next: Entity[]) => dispatch({ type: "commit", entities: next });
  const toggle = (id: string) => commit(entities.map((e) => e.id === id ? { ...e, enabled: !e.enabled } : e));
  const toggleCat = (cat: CategoryId, on: boolean) => commit(entities.map((e) => e.category === cat ? { ...e, enabled: on } : e));
  const add = (value: string, category: CategoryId) => {
    if (entities.some((e) => e.text === value)) { toast.info(x.exists); return; }
    commit([...entities, {
      id: `m-${Date.now()}`, text: value, category, enabled: true, manual: true,
      reason: x.manual,
      gdpr_basis: ["saude", "biometrico", "religiao_etnia"].includes(category) ? "Art. 9.º(1) RGPD" : "Art. 4.º(1) RGPD",
    }]);
  };
  // Tell the backend what the reviewer kept visible before showing the result,
  // so its leak check and downloads match the page.
  const generate = async () => {
    if (docId) {
      const keep = entities.filter((e) => !e.enabled).flatMap((e) => e.refs ?? []);
      try { setSummary(await syncDecisions(docId, keep)); } catch (e) { console.error(e); }
      // A photo is shown back redacted, as the backend built and checked it.
      if (redactable && source?.kind === "image") {
        try { showRedacted(URL.createObjectURL((await downloadRedacted(docId)).blob)); } catch (e) { console.error(e); showRedacted(null); }
      }
    }
    setStep(2);
  };
  const saveRedacted = async () => {
    try {
      const { blob, filename } = await downloadRedacted(docId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      // The backend explains why (a check failed, a line was not read...).
      toast.error(e instanceof Error ? e.message : x.unknownErr);
    }
  };
  const clear = () => {
    setRedactable(false); setUnread(0); showRedacted(null);
    setText(""); setFileName(""); replaceSource(null); setError(""); dispatch({ type: "reset", entities: [] }); setSummary(""); setStep(0);
    // The OCR worker and its models are only worth keeping while a document is open.
    void terminateOcr();
    // The backend keeps documents in memory until they are deleted.
    if (docId) { void deleteDocument(docId).catch(() => {}); setDocId(""); }
  };
  // Page-wide file dropping; text selections are never treated as files.
  useEffect(() => {
    let depth = 0;
    const hasFile = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => { if (!hasFile(e)) return; e.preventDefault(); depth++; if (!loading && !reading) setDragging(true); };
    const over = (e: DragEvent) => { if (hasFile(e)) e.preventDefault(); };
    const leave = (e: DragEvent) => { if (!hasFile(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const drop = (e: DragEvent) => { if (!hasFile(e)) return; e.preventDefault(); depth = 0; setDragging(false); const f = e.dataTransfer?.files[0]; if (f && !loading && !reading) void handleFile(f); };
    const reset = () => { depth = 0; setDragging(false); };
    window.addEventListener("dragenter", enter); window.addEventListener("dragover", over); window.addEventListener("dragleave", leave); window.addEventListener("drop", drop); window.addEventListener("blur", reset);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); window.removeEventListener("blur", reset); };
  }, [loading, reading, cfg.lang]);
  useEffect(() => {
    document.title = `Lethe — ${x.subtitle}`;
    for (const selector of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]']) {
      document.querySelector(selector)?.setAttribute("content", selector.includes("og:title") ? document.title : x.subtitle);
    }
  }, [x.subtitle]);
  const reason = (e: Entity) => e.manual ? x.manual : e.reason;

  const active = entities.filter((e) => e.enabled);
  const report = () => {
    const lines = [
      `# Lethe — ${u.reportHeading}`, "",
      `- ${u.anonymizedEntities}: **${st.count}**`,
      `- ${t.pctWords}: **${st.pct}%**`,
      `- ${t.risk} (${t.original}): **${x.risk[st.risk]}**`, "",
      `## ${u.byCategory}`, "",
      ...CATEGORIES.filter((c) => st.perCat[c.id]).map((c) => `- ${x.cats[c.id]}: ${st.perCat[c.id]}`), "",
      `## ${t.entities}`, "",
      `| ${x.thEntity} | ${x.thCategory} | ${x.thReason} |`, "|---|---|---|",
      ...active.map((e) => `| ${partialMask(e.text)} | ${x.cats[e.category]} | ${reason(e).replace(/\|/g, "/")} |`), "",
      `## ${u.explanation}`, "", summary || "—", "",
    ];
    return lines.join("\n");
  };

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
              <div className="flex items-start gap-3"><AlertTriangle className="mt-1 size-6 shrink-0 text-destructive" /><div className="min-w-0"><h2 className="font-semibold">{u.errorTitle}</h2><p className="mt-2 break-words text-sm text-muted-foreground">{error}</p></div></div>
              <div className="mt-5 flex flex-wrap gap-2"><Button onClick={run}><RotateCw className="size-4" />{u.retry}</Button><Button variant="outline" onClick={clear}>{u.home}</Button></div>
            </section>
          )}

          {step === 0 && !error && (
            <DocumentInput text={text} name={fileName} dragging={dragging} busy={busy} preview={source?.previewUrl ?? null} kind={source?.kind ?? null} onFile={handleFile} onText={(value) => { setText(value); setError(""); }} onClear={clear} onAnalyze={run} />
          )}

          {step === 1 && loading && <ReviewSkeleton />}

          {step === 1 && !loading && (
            <section>
              {entities.length === 0 && (
                <div className="mb-4 flex items-center gap-3 rounded-2xl border border-dashed bg-card p-5">
                  <div className="grid size-16 shrink-0 place-items-center rounded-full bg-primary/10"><SearchX className="size-8 text-primary" aria-hidden="true" /></div>
                  <div>
                    <h2 className="font-medium">{t.noneTitle}</h2>
                    <p className="text-sm text-muted-foreground">{t.noneSub}</p>
                    <Button variant="link" className="mt-2 px-0" onClick={clear}>{u.home}</Button>
                  </div>
                </div>
              )}
              {entities.length > 0 && <ReviewPanel backLabel={t.back} generateLabel={t.generate} onBack={() => setStep(0)} onGenerate={generate} text={text} entities={entities} onToggle={toggle} onToggleCategory={toggleCat} onAdd={add} onUndo={() => dispatch({ type: "undo" })} onRedo={() => dispatch({ type: "redo" })} canUndo={history.past.length > 0} canRedo={history.future.length > 0} />}
              {entities.length > 0 && <div className="mt-6 hidden lg:flex lg:justify-between">
                <Button variant="ghost" onClick={() => setStep(0)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-muted"><ArrowLeft className="h-4 w-4" /> {t.back}</Button>
                <Button variant="ghost" onClick={generate} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:opacity-90">{t.generate} <ArrowRight className="h-4 w-4" /></Button>
              </div>}
            </section>
          )}

          {step === 2 && (
            <section className="animate-fade-up space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 text-sm text-muted-foreground">
                  {unplaced > 0 && <span role="status" className="inline-flex items-center gap-2 rounded-md border border-amber-600/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3.5" aria-hidden="true" />{u.unplaced.replace("{n}", String(unplaced))}</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {hasPages && (
                    <div className="inline-flex rounded-lg border bg-muted/40 p-1" role="group" aria-label={u.docView}>
                      {([["pages", ImageIcon, u.viewDocument], ["text", FileText, u.viewText]] as const).map(([id, Icon, label]) => (
                        <Button key={id} variant="ghost" aria-pressed={docView === id} onClick={() => setDocView(id)} className={`h-9 gap-2 rounded-md px-3 text-sm ${docView === id ? "bg-card text-foreground shadow-sm hover:bg-card" : "text-muted-foreground hover:bg-transparent hover:text-foreground"}`}><Icon className="size-4" aria-hidden="true" />{label}</Button>
                      ))}
                    </div>
                  )}
                  <div className="inline-flex rounded-lg border bg-muted/40 p-1" role="group" aria-label={u.comparison}>
                    {([["side", Columns2, u.sideBySide], ["slide", ArrowLeftRight, u.slideView]] as const).map(([id, Icon, label]) => (
                      <Button key={id} variant="ghost" aria-pressed={resultView === id} onClick={() => { setResultView(id); if (id === "slide") setSliderSeen(true); }} className={`h-9 gap-2 rounded-md px-3 text-sm ${resultView === id ? "bg-card text-foreground shadow-sm hover:bg-card" : "text-muted-foreground hover:bg-transparent hover:text-foreground"}`}><Icon className="size-4" aria-hidden="true" />{label}</Button>
                    ))}
                  </div>
                </div>
              </div>
              <div className={resultView === "slide" ? "" : "hidden"}>
                {sliderSeen && (showPages
                  ? <PageComparison pages={pages} urls={pageUrls} redactedUrls={redactedUrls} boxes={redaction.boxes} focusId={focusId} />
                  : <RiverComparison text={text} entities={entities} output={output} focusId={focusId} />)}
              </div>
              <div className={resultView === "side" ? "grid min-w-0 gap-4 md:grid-cols-2" : "hidden"}>
                {[[t.original, text, true], [t.anonymized, output, false]].map(([h, c, orig]) => (
                  <div key={String(h)} className="min-w-0 rounded-lg border bg-card p-4 sm:p-5">
                    <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{h}</h2>
                    {showPages
                      ? <div tabIndex={0} aria-label={String(h)} data-page-scroll={orig ? "o" : "a"} className="max-h-[70dvh] overflow-auto rounded-md bg-muted/40" onScroll={(e) => {
                        // Keep the two page columns at the same place while one of them scrolls.
                        const me = e.currentTarget, other = me.parentElement?.parentElement?.querySelector<HTMLElement>(`[data-page-scroll]:not([data-page-scroll="${orig ? "o" : "a"}"])`);
                        if (other && Math.abs(other.scrollTop - me.scrollTop) > 1) other.scrollTop = me.scrollTop;
                      }}>
                        <PageStack pages={pages} urls={pageUrls} redactedUrls={redactedUrls} boxes={redaction.boxes} mode={orig ? "original" : "redacted"} focusId={focusId} pageLabel={(n) => u.pageN.replace("{n}", String(n))} />
                      </div>
                      : <pre tabIndex={0} aria-label={String(h)} className="max-h-[60dvh] overflow-auto whitespace-pre-wrap break-words font-mono text-sm leading-6 [overflow-wrap:anywhere]">
                        {orig ? <FocusedText text={text} entities={entities} focusId={focusId} /> : String(c).split("*").map((part, i, arr) => (
                          <span key={i}>{part}{i < arr.length - 1 && <span className="lethe-wash text-primary" style={{ animationDelay: `${Math.min(i * 40, 1600)}ms` }}>*</span>}</span>
                        ))}
                      </pre>}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:flex sm:flex-wrap">
                <Button variant="ghost" onClick={() => setStep(1)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-muted"><ArrowLeft className="h-4 w-4" /> {t.review}</Button>
                <Button variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(output); toast.success(t.copied); } catch { toast.error(u.copyFailed); } }} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-muted"><Copy className="h-4 w-4" /> {t.copy}</Button>
                <Button variant="ghost" onClick={() => download("submission.txt", output)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"><Download className="h-4 w-4" /> {t.downloadTxt}</Button>
                <Button variant="ghost" onClick={() => download("lethe-relatorio.md", report(), "text/markdown")} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-muted"><FileDown className="h-4 w-4" /> {t.downloadReport}</Button>
                {docId && redactable && <Button variant="ghost" onClick={() => void saveRedacted()} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-muted"><ShieldCheck className="h-4 w-4" /> {u.downloadRedacted}</Button>}
              </div>
              {docId && unread > 0 && <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">{u.unreadLines.replace("{n}", String(unread))}</p>}

              <div className="border-t pt-8">
                <h2 className="text-base font-semibold tracking-tight">{t.reportTitle}</h2>

                <dl className="mt-5 grid grid-cols-3 divide-x overflow-hidden rounded-lg border bg-card">
                  {[
                    { label: t.entities, value: String(st.count), tone: "", bar: "var(--primary)", fill: Math.min(100, st.count * 5) },
                    { label: t.pctWords, value: `${st.pct}%`, tone: "", bar: "var(--primary)", fill: Math.min(100, st.pct) },
                    { label: t.risk, value: x.risk[st.risk] ?? st.risk, tone: st.risk === "Alto" ? "text-destructive" : st.risk === "Médio" ? "text-warning" : "text-success", bar: st.risk === "Alto" ? "var(--destructive)" : st.risk === "Médio" ? "var(--warning)" : "var(--success)", fill: st.risk === "Alto" ? 100 : st.risk === "Médio" ? 60 : 25 },
                  ].map((s) => (
                    <div key={s.label} className="relative min-w-0 px-3 pb-4 pt-3.5 sm:px-5">
                      <dt className="text-[10px] font-medium uppercase leading-snug tracking-[0.12em] text-muted-foreground sm:text-[11px] sm:tracking-[0.14em]">{s.label}</dt>
                      <dd className={`mt-1.5 text-2xl font-semibold tabular-nums sm:text-3xl ${s.tone}`}>{s.value}</dd>
                      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-border"><span className="block h-full" style={{ width: `${s.fill}%`, background: s.bar }} /></span>
                    </div>
                  ))}
                </dl>

                <div className="mt-6 rounded-lg border bg-card p-4 sm:p-5">
                  <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{u.byCategory}</h3>
                  <div aria-hidden="true" className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-sm">
                    {CATEGORIES.filter((c) => st.perCat[c.id]).map((c) => (
                      <span key={c.id} style={{ flexGrow: st.perCat[c.id], background: c.color }} />
                    ))}
                  </div>
                  <ul className="mt-4 grid gap-x-8 gap-y-1 sm:grid-cols-2">
                    {CATEGORIES.filter((c) => st.perCat[c.id]).map((c) => (
                      <li key={c.id} className="flex items-center gap-2 py-1 text-sm">
                        <span aria-hidden="true" className="size-2 shrink-0 rounded-sm" style={{ background: c.color }} />
                        <span className="min-w-0 truncate">{x.cats[c.id]}</span>
                        <span aria-hidden="true" className="min-w-3 flex-1 border-b border-dotted border-border" />
                        <span className="shrink-0 font-semibold tabular-nums">{st.perCat[c.id]}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div tabIndex={0} role="region" aria-label={t.reportTitle} className="mt-6 overflow-x-auto rounded-lg border bg-card">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="px-4 py-2.5 font-medium">{x.thEntity}</th>
                        <th className="px-4 py-2.5 font-medium">{x.thCategory}</th>
                        <th className="px-4 py-2.5 font-medium">{x.thReason}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {active.map((e) => {
                        const cat = catOf(e.category);
                        return (
                          <tr key={e.id} onClick={() => setFocusId((id) => id === e.id ? "" : e.id)} className={`cursor-pointer align-top transition-colors hover:bg-muted/30 ${focusId === e.id ? "bg-primary/10" : ""}`}>
                            <td className="px-4 py-3"><button type="button" aria-pressed={focusId === e.id} onClick={(ev) => { ev.stopPropagation(); setFocusId((id) => id === e.id ? "" : e.id); }} className="inline-block min-h-0 rounded-md border-l-2 bg-muted px-2.5 py-1 text-left font-mono text-[13px] font-medium text-foreground transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [overflow-wrap:anywhere]" style={{ borderLeftColor: cat.color }}>{e.text}</button></td>
                            <td className="px-4 py-3"><span className="inline-flex items-center gap-2 whitespace-nowrap"><span aria-hidden="true" className="size-2 rounded-sm" style={{ background: cat.color }} />{x.cats[cat.id]}</span></td>
                            <td className="px-4 py-3 text-muted-foreground [overflow-wrap:anywhere]">{reason(e)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </main>

        {dragging && <div aria-hidden="true" className="pointer-events-none fixed inset-3 z-40 grid place-items-center rounded-lg border-2 border-dashed border-primary bg-background/90 text-primary"><p className="px-5 text-center text-xl font-semibold">{u.dropTitle}</p></div>}
      </div>
    </div>
  );
}
