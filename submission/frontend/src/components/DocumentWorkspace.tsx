import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowLeftRight, ArrowRight, Columns2, Copy, Download,
  FileDown, AlertTriangle, SearchX, ShieldCheck, FileText, Image as ImageIcon,
} from "lucide-react";
import { RiverComparison } from "@/components/RiverComparison";
import { PageComparison } from "@/components/PageComparison";
import { PageStack } from "@/components/PageStack";
import { FocusedMasked, FocusedText } from "@/components/FocusedText";
import { ReviewPanel } from "@/components/ReviewPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageImages } from "@/hooks/usePageImages";
import { alignText, redactionBoxes } from "@/lib/redaction";
import { UI } from "@/lib/i18n-ui";
import { EXTRA } from "@/lib/i18n-extra";
import { useSettings } from "@/lib/settings";
import { emptyHistory, reviewHistory } from "@/lib/review-history";
import { downloadRedacted, syncDecisions } from "@/services/anonymizer";
import {
  CATEGORIES, anonymize, catOf, findSpans, partialMask, stats,
  type CategoryId, type Entity,
} from "@/lib/anonymizer";
import { entitiesFrom, type DocStatus, type OpenDoc } from "@/lib/workspace";

function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  doc: OpenDoc;
  /** The tab on screen. The others stay mounted, hidden, so they keep their review. */
  active: boolean;
  onStatus: (status: DocStatus) => void;
  /** "Back" from the review: the shell reopens the files for another analysis. */
  onBack: () => void;
  onHome: () => void;
  /** "Generate" asks the shell, which raises `generateAll`: every document still in review generates at once. */
  onGenerate: () => void;
  generateAll: number;
  generateLabel: string;
}

/**
 * One analysed document: its review (step 1) and its result page (step 2),
 * with the state both need. The shell above it holds the intake and the
 * tabs; this component never talks to its siblings.
 */
export function DocumentWorkspace({ doc, active, onStatus, onBack, onHome, onGenerate, generateAll, generateLabel }: Props) {
  const { source, result } = doc;
  // The document as the backend read it, so the highlights match its lines.
  const text = result.text;
  const docId = result.docId ?? "";
  // What the backend said about the file it read: whether it can return the
  // file redacted, and how many text lines its OCR could not read.
  const redactable = !!result.redactable;
  const unread = result.unread ?? 0;
  const [step, setStep] = useState<1 | 2>(1);
  const [history, dispatch] = useReducer(reviewHistory, result, (r) => reviewHistory(emptyHistory, { type: "reset", entities: entitiesFrom(r) }));
  const entities = history.present;
  const [redactedUrl, setRedactedUrl] = useState<string | null>(null);
  // The result page opens at once; while the backend applies the review
  // (and builds a photo's redacted PNG) the parts that depend on it show
  // skeletons. The counter drops answers of a generate that was superseded.
  const [finishing, setFinishing] = useState(false);
  const generation = useRef(0);
  const showRedacted = (url: string | null) => setRedactedUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
  useEffect(() => () => { setRedactedUrl((old) => { if (old) URL.revokeObjectURL(old); return null; }); }, []);
  const [resultView, setResultView] = useState<"side" | "slide">("slide");
  // Photos and PDFs can be shown as their pages, with the masked words
  // blacked out in place, or as text; plain text and DOCX only have text.
  const [docView, setDocView] = useState<"text" | "pages">("pages");
  const [focusId, setFocusId] = useState("");
  const hasPages = (source?.pages.length ?? 0) > 0;
  const showPages = hasPages && docView === "pages";
  // Pages are rendered once the result is on screen, and kept while the tab
  // is hidden so coming back to it is instant.
  const [pagesWanted, setPagesWanted] = useState(false);
  useEffect(() => { if (active && step === 2) setPagesWanted(true); }, [active, step]);
  const pageUrls = usePageImages(source, pagesWanted && hasPages);
  useEffect(() => { if (step !== 2) setFocusId(""); }, [step]);
  // An entity found only inside a longer one ("João" in "João Silva") has no
  // span of its own, so the views point at the entity that masks it instead.
  const markOf = useCallback((id: string) => {
    if (!id) return "";
    const spans = findSpans(text, entities.filter((e) => e.enabled));
    if (spans.some((sp) => sp.entity.id === id)) return id;
    const needle = entities.find((e) => e.id === id)?.text.trim();
    return (needle && spans.find((sp) => text.slice(sp.start, sp.end).includes(needle))?.entity.id) || id;
  }, [text, entities]);
  const markId = useMemo(() => markOf(focusId), [markOf, focusId]);
  // Set when a click switched the document view to the text for an entity the page lacks.
  const [fellBack, setFellBack] = useState(false);
  useEffect(() => { if (active) window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!markId) return;
    // getClientRects, not offsetParent: page boxes are SVG rects, which have no
    // offsetParent, so the hidden view's marks would otherwise come first.
    const marks = [...document.querySelectorAll<HTMLElement>("[data-focus-mark]")].filter((m) => m.getClientRects().length > 0);
    marks[0]?.scrollIntoView({ block: "center", behavior: "smooth" });
    // The other text column scrolls on its own: bring its first mark to its middle too.
    const first = marks[0]?.closest("pre");
    const other = marks.find((m) => m.closest("pre") && m.closest("pre") !== first);
    const box = other?.closest("pre");
    if (other && box) {
      const top = box.scrollTop + other.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 2;
      box.scrollTo({ top, behavior: "smooth" });
    }
  }, [markId, resultView, docView]); // eslint-disable-line react-hooks/exhaustive-deps
  const [summary, setSummary] = useState(result.summary);
  const { t, s: cfg } = useSettings();
  const x = EXTRA[cfg.lang];
  const u = UI[cfg.lang];
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  useEffect(() => { statusRef.current({ step, finishing }); }, [step, finishing]);

  const output = useMemo(() => anonymize(text, entities), [text, entities]);
  const st = useMemo(() => stats(text, entities), [text, entities]);
  // The page boxes come from the same spans anonymize() masks. Aligning the
  // backend's text onto the page words read here is the slow part and
  // depends only on both texts, so it is memoised apart from the entities.
  const pages = useMemo(() => source?.pages ?? [], [source]);
  const alignment = useMemo(() => alignText(text, pages), [text, pages]);
  const redaction = useMemo(() => redactionBoxes(text, entities, pages, alignment), [text, entities, pages, alignment]);
  // An entity the page view cannot locate (the OCR here read those words
  // differently) switches the view to the text, where it is always marked;
  // the toggle then says so and switches back.
  const focusEntity = (id: string) => {
    const next = focusId === id ? "" : id;
    const fallBack = !!next && showPages && !redaction.boxes.some((b) => b.entityId === markOf(next));
    setFocusId(next);
    setFellBack(fallBack);
    if (fallBack) setDocView("text");
  };
  // A photo's redacted half is the file the backend built and verified; the
  // boxes drawn here only locate the focused entity on it.
  const redactedUrls = useMemo(() => (redactedUrl && source?.kind === "image" ? [redactedUrl] : []), [redactedUrl, source]);
  const awaitingRedacted = finishing && redactable && source?.kind === "image";
  const unplaced = showPages && !redactedUrls.length && !awaitingRedacted ? redaction.unplaced : 0;

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
  // Show the result at once and tell the backend what the reviewer kept
  // visible, so its leak check and downloads match the page; the report
  // and the redacted file wait behind skeletons until it has answered.
  const generate = async () => {
    setStep(2);
    if (!docId) return;
    const mine = ++generation.current;
    const stale = () => generation.current !== mine;
    setFinishing(true);
    showRedacted(null);
    try {
      const keep = entities.filter((e) => !e.enabled).flatMap((e) => e.refs ?? []);
      try {
        const summary = await syncDecisions(docId, keep);
        if (!stale()) setSummary(summary);
      } catch (e) { console.error(e); }
      // A photo is shown back redacted, as the backend built and checked it.
      if (redactable && source?.kind === "image" && !stale()) {
        try {
          const { blob } = await downloadRedacted(docId);
          if (!stale()) showRedacted(URL.createObjectURL(blob));
        } catch (e) { console.error(e); if (!stale()) showRedacted(null); }
      }
    } finally { if (!stale()) setFinishing(false); }
  };
  // The shell's signal: each raise generates this document too, while it is in review.
  const seenGenerate = useRef(generateAll);
  useEffect(() => {
    if (generateAll === seenGenerate.current) return;
    seenGenerate.current = generateAll;
    if (step === 1) void generate();
  }, [generateAll]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const reason = (e: Entity) => e.manual ? x.manual : e.reason;

  const active_ = entities.filter((e) => e.enabled);
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
      ...active_.map((e) => `| ${partialMask(e.text)} | ${x.cats[e.category]} | ${reason(e).replace(/\|/g, "/")} |`), "",
      `## ${u.explanation}`, "", summary || "—", "",
    ];
    return lines.join("\n");
  };

  return (
    <div className={active ? "contents" : "hidden"} aria-hidden={!active}>
      {step === 1 && (
        <section>
          {entities.length === 0 && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-dashed bg-card p-5">
              <div className="grid size-16 shrink-0 place-items-center rounded-full bg-primary/10"><SearchX className="size-8 text-primary" aria-hidden="true" /></div>
              <div>
                <h2 className="font-medium">{t.noneTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.noneSub}</p>
                <Button variant="link" className="mt-2 px-0" onClick={onHome}>{u.home}</Button>
              </div>
            </div>
          )}
          {entities.length > 0 && <ReviewPanel backLabel={t.back} generateLabel={generateLabel} onBack={onBack} onGenerate={onGenerate} text={text} entities={entities} onToggle={toggle} onToggleCategory={toggleCat} onAdd={add} onUndo={() => dispatch({ type: "undo" })} onRedo={() => dispatch({ type: "redo" })} canUndo={history.past.length > 0} canRedo={history.future.length > 0} />}
          {entities.length > 0 && <div className="mt-6 hidden lg:flex lg:justify-between">
            <Button variant="ghost" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-muted"><ArrowLeft className="h-4 w-4" /> {t.back}</Button>
            <Button variant="ghost" onClick={onGenerate} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:opacity-90">{generateLabel} <ArrowRight className="h-4 w-4" /></Button>
          </div>}
        </section>
      )}

      {step === 2 && (
        <section className="animate-fade-up space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm text-muted-foreground">
              {finishing && <span role="status" aria-busy="true" className="inline-flex items-center gap-2 text-xs"><span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />{u.finishing}</span>}
              {fellBack && docView === "text" && <span role="status" className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium"><FileText className="size-3.5" aria-hidden="true" />{u.notOnPage}</span>}
              {unplaced > 0 && <span role="status" className="inline-flex items-center gap-2 rounded-md border border-amber-600/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3.5" aria-hidden="true" />{u.unplaced.replace("{n}", String(unplaced))}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {hasPages && (
                <div className="inline-flex rounded-lg border bg-muted/40 p-1" role="group" aria-label={u.docView}>
                  {([["pages", ImageIcon, u.viewDocument], ["text", FileText, u.viewText]] as const).map(([id, Icon, label]) => (
                    <Button key={id} variant="ghost" aria-pressed={docView === id} onClick={() => { setDocView(id); setFellBack(false); }} className={`h-9 gap-2 rounded-md px-3 text-sm ${docView === id ? "bg-card text-foreground shadow-sm hover:bg-card" : "text-muted-foreground hover:bg-transparent hover:text-foreground"}`}><Icon className="size-4" aria-hidden="true" />{label}</Button>
                  ))}
                </div>
              )}
              <div className="inline-flex rounded-lg border bg-muted/40 p-1" role="group" aria-label={u.comparison}>
                {([["side", Columns2, u.sideBySide], ["slide", ArrowLeftRight, u.slideView]] as const).map(([id, Icon, label]) => (
                  <Button key={id} variant="ghost" aria-pressed={resultView === id} onClick={() => setResultView(id)} className={`h-9 gap-2 rounded-md px-3 text-sm ${resultView === id ? "bg-card text-foreground shadow-sm hover:bg-card" : "text-muted-foreground hover:bg-transparent hover:text-foreground"}`}><Icon className="size-4" aria-hidden="true" />{label}</Button>
                ))}
              </div>
            </div>
          </div>
          <div className={resultView === "slide" ? "" : "hidden"}>
            {showPages
              ? <PageComparison pages={pages} urls={pageUrls} redactedUrls={redactedUrls} boxes={redaction.boxes} focusId={markId} pending={awaitingRedacted} />
              : <RiverComparison text={text} entities={entities} output={output} focusId={markId} />}
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
                    <PageStack pages={pages} urls={pageUrls} redactedUrls={redactedUrls} boxes={redaction.boxes} mode={orig ? "original" : "redacted"} focusId={markId} pending={awaitingRedacted} pageLabel={(n) => u.pageN.replace("{n}", String(n))} />
                  </div>
                  : <pre tabIndex={0} aria-label={String(h)} className="max-h-[60dvh] overflow-auto whitespace-pre-wrap break-words font-mono text-sm leading-6 [overflow-wrap:anywhere]">
                    {orig ? <FocusedText text={text} entities={entities} focusId={markId} /> : <FocusedMasked text={text} entities={entities} focusId={markId} />}
                  </pre>}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:flex sm:flex-wrap">
            <Button variant="ghost" onClick={() => setStep(1)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-muted"><ArrowLeft className="h-4 w-4" /> {t.review}</Button>
            <Button variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(output); toast.success(t.copied); } catch { toast.error(u.copyFailed); } }} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-muted"><Copy className="h-4 w-4" /> {t.copy}</Button>
            <Button variant="ghost" onClick={() => download("submission.txt", output)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"><Download className="h-4 w-4" /> {t.downloadTxt}</Button>
            {finishing
              ? <Skeleton aria-hidden="true" className="h-10 rounded-xl" style={{ width: "10rem" }} />
              : <Button variant="ghost" onClick={() => download("lethe-relatorio.md", report(), "text/markdown")} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-muted"><FileDown className="h-4 w-4" /> {t.downloadReport}</Button>}
            {docId && redactable && (finishing
              ? <Skeleton aria-hidden="true" className="h-10 rounded-xl" style={{ width: "12rem", animationDelay: "120ms" }} />
              : <Button variant="ghost" onClick={() => void saveRedacted()} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-muted"><ShieldCheck className="h-4 w-4" /> {u.downloadRedacted}</Button>)}
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
                  {active_.map((e) => {
                    const cat = catOf(e.category);
                    return (
                      <tr key={e.id} onClick={() => focusEntity(e.id)} className={`cursor-pointer align-top transition-colors hover:bg-muted/30 ${focusId === e.id ? "bg-primary/10" : ""}`}>
                        <td className="px-4 py-3"><button type="button" aria-pressed={focusId === e.id} onClick={(ev) => { ev.stopPropagation(); focusEntity(e.id); }} className="inline-block min-h-0 rounded-md border-l-2 bg-muted px-2.5 py-1 text-left font-mono text-[13px] font-medium text-foreground transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [overflow-wrap:anywhere]" style={{ borderLeftColor: cat.color }}>{e.text}</button></td>
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
    </div>
  );
}
