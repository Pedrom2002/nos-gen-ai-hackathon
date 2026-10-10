import { LetheLogo } from "@/components/LetheLogo";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useReducer, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Copy, Download,
  FileDown, Check, AlertTriangle, RotateCw, SearchX,
} from "lucide-react";
import { DocumentInput } from "@/components/DocumentInput";
import { RiverLoading } from "@/components/RiverLoading";
import { RiverComparison } from "@/components/RiverComparison";
import { UI } from "@/lib/i18n-ui";
import { emptyHistory, reviewHistory } from "@/lib/review-history";
import { analyzeDocument, deleteDocument, syncDecisions } from "@/services/anonymizer";
import {
  CATEGORIES, anonymize, catOf, normalizeCategory, partialMask, stats,
  type CategoryId, type Entity,
} from "@/lib/anonymizer";
import { extractPdfText } from "@/lib/pdf";
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
  // The last file loaded and the text it gave. The file itself goes to the
  // backend when the text was not edited, so a PDF is read as run.py reads it.
  const [source, setSource] = useState<{ file: File; text: string } | null>(null);
  const [docId, setDocId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [resultView, setResultView] = useState<"side" | "slide">("side");
  const [sliderSeen, setSliderSeen] = useState(false);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const { t, s: cfg } = useSettings();
  const x = EXTRA[cfg.lang];
  const u = UI[cfg.lang];
  const STEPS = t.steps;
  const [error, setError] = useState("");

  const output = useMemo(() => anonymize(text, entities), [text, entities]);
  const st = useMemo(() => stats(text, entities), [text, entities]);

  const handleFile = async (f: File) => {
    if (!/\.(pdf|txt)$/i.test(f.name)) { toast.error(u.invalidFile); return; }
    setReading(true);
    try {
      const t = f.name.toLowerCase().endsWith(".pdf") ? await extractPdfText(f) : await f.text();
      setText(t);
      setSource({ file: f, text: t });
      setFileName(f.name);
      setStep(0);
      setError("");
      if (!t.trim()) toast.info(x.emptyDoc); else toast.success(u.fileLoaded.replace("{name}", f.name));
    } catch (e) {
      console.error(e);
      toast.error(x.readFail);
    } finally { setReading(false); }
  };

  const run = async () => {
    if (!text.trim()) { toast.error(x.emptyDoc); return; }
    setLoading(true);
    setError("");
    try {
      const r = await analyzeDocument(text, source && source.text === text ? source.file : null);
      if (docId) void deleteDocument(docId).catch(() => {});
      setDocId(r.docId ?? "");
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
      setSliderSeen(false);
      setSummary(r.summary);
      setStep(1);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : x.unknownErr;
      setError(msg);
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
    }
    setStep(2);
  };
  const clear = () => {
    setText(""); setFileName(""); setSource(null); setError(""); dispatch({ type: "reset", entities: [] }); setSummary(""); setStep(0);
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
                <LetheLogo className="h-7 w-7 shrink-0" />
                <span className="shrink-0 text-lg font-semibold">Lethe</span>
              </div>
              <SettingsSheet />
            </nav>
            <div aria-hidden="true" className="h-px bg-border" />
          </div>
        </header>

        <main className={`mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pt-6 sm:px-6 sm:pt-8 ${step === 1 ? "pb-40 lg:pb-16" : "pb-16"}`}>
          <h1 className="sr-only">{STEPS[step]}</h1>
          <div className="mb-6 flex min-w-0 flex-col items-center gap-3">
            <ol aria-label={STEPS.join(" · ")} className="flex w-full max-w-2xl min-w-0 items-center justify-center gap-1 sm:flex md:gap-2">
              {STEPS.map((s, i) => (
                <li key={s} aria-current={i === step ? "step" : undefined} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold sm:size-8 sm:text-sm ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {i < step ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span className={`${i === step ? "inline font-semibold" : "hidden md:inline text-muted-foreground"} min-w-0 truncate text-sm`}>{s}</span>
                  {i < STEPS.length - 1 && <span className="mx-1 h-px min-w-2 flex-1 bg-border md:mx-2 md:min-w-3" />}
                </li>
              ))}
            </ol>
            <div aria-hidden="true" className="h-px w-full max-w-4xl bg-border" />
          </div>

          {step === 0 && loading && <RiverLoading text={text} />}

          {step === 0 && !loading && error && (
            <section role="alert" className="mx-auto mb-6 max-w-3xl rounded-lg border border-destructive/30 bg-card p-5 animate-fade-up">
              <div className="flex items-start gap-3"><AlertTriangle className="mt-1 size-6 shrink-0 text-destructive" /><div className="min-w-0"><h2 className="font-semibold">{u.errorTitle}</h2><p className="mt-2 break-words text-sm text-muted-foreground">{error}</p></div></div>
              <div className="mt-5 flex flex-wrap gap-2"><Button onClick={run}><RotateCw className="size-4" />{u.retry}</Button><Button variant="outline" onClick={clear}>{u.home}</Button></div>
            </section>
          )}

          {step === 0 && !loading && !error && (
            <DocumentInput text={text} name={fileName} dragging={dragging} reading={reading} onFile={handleFile} onText={(value) => { setText(value); setError(""); }} onClear={clear} onAnalyze={run} />
          )}

          {step === 1 && (
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
              <div className="flex flex-wrap items-center justify-end gap-2" role="group" aria-label={u.comparison}>
                <Button variant={resultView === "side" ? "secondary" : "ghost"} aria-pressed={resultView === "side"} onClick={() => setResultView("side")}>{u.sideBySide}</Button>
                <span className="text-border" aria-hidden="true">|</span>
                <Button variant={resultView === "slide" ? "secondary" : "ghost"} aria-pressed={resultView === "slide"} onClick={() => { setResultView("slide"); setSliderSeen(true); }}>{u.slideView}</Button>
              </div>
              <div className={resultView === "slide" ? "" : "hidden"}>
                {sliderSeen && <RiverComparison text={text} entities={entities} output={output} />}
              </div>
              <div className={resultView === "side" ? "grid min-w-0 gap-4 md:grid-cols-2" : "hidden"}>
                {[[t.original, text, true], [t.anonymized, output, false]].map(([h, c, orig]) => (
                  <div key={String(h)} className="min-w-0 rounded-lg border bg-card p-4 sm:p-5">
                    <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{h}</h2>
                    <pre tabIndex={0} aria-label={String(h)} className="max-h-[60dvh] overflow-auto whitespace-pre-wrap break-words font-mono text-sm leading-6 [overflow-wrap:anywhere]">
                      {orig ? c : String(c).split("*").map((part, i, arr) => (
                        <span key={i}>{part}{i < arr.length - 1 && <span className="lethe-wash text-primary" style={{ animationDelay: `${Math.min(i * 40, 1600)}ms` }}>*</span>}</span>
                      ))}
                    </pre>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:flex sm:flex-wrap">
                <Button variant="ghost" onClick={() => setStep(1)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-muted"><ArrowLeft className="h-4 w-4" /> {t.review}</Button>
                <Button variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(output); toast.success(t.copied); } catch { toast.error(u.copyFailed); } }} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-muted"><Copy className="h-4 w-4" /> {t.copy}</Button>
                <Button variant="ghost" onClick={() => download("submission.txt", output)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"><Download className="h-4 w-4" /> {t.downloadTxt}</Button>
                <Button variant="ghost" onClick={() => download("lethe-relatorio.md", report(), "text/markdown")} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-muted"><FileDown className="h-4 w-4" /> {t.downloadReport}</Button>
              </div>

              <div className="border-t pt-8">
                <h2 className="text-base font-semibold tracking-tight">{t.reportTitle}</h2>

                <dl className="mt-5 grid grid-cols-3 gap-x-4 sm:gap-x-0">
                  {[
                    { label: t.entities, value: String(st.count), tone: "" },
                    { label: t.pctWords, value: `${st.pct}%`, tone: "" },
                    { label: t.risk, value: x.risk[st.risk] ?? st.risk, tone: st.risk === "Alto" ? "text-destructive" : st.risk === "Médio" ? "text-warning" : "text-success" },
                  ].map((s) => (
                    <div key={s.label} className="min-w-0 sm:border-l sm:border-border sm:pl-5 sm:first:border-l-0 sm:first:pl-0">
                      <dt className="text-[10px] font-medium uppercase leading-snug tracking-[0.12em] text-muted-foreground sm:text-[11px] sm:tracking-[0.14em]">{s.label}</dt>
                      <dd className={`mt-1 text-lg font-semibold tabular-nums sm:text-xl ${s.tone}`}>{s.value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-7">
                  <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{u.byCategory}</h3>
                  <ul className="mt-2 max-w-sm">
                    {CATEGORIES.filter((c) => st.perCat[c.id]).map((c) => (
                      <li key={c.id} className="flex items-center gap-2 py-1 text-sm">
                        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ background: c.color }} />
                        <span className="min-w-0 truncate">{x.cats[c.id]}</span>
                        <span aria-hidden="true" className="min-w-3 flex-1 border-b border-dotted border-border" />
                        <span className="shrink-0 font-semibold tabular-nums">{st.perCat[c.id]}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div tabIndex={0} role="region" aria-label={t.reportTitle} className="mt-7 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-y border-border text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="py-2 pr-3 font-medium sm:pr-5">{x.thEntity}</th>
                        <th className="py-2 pr-3 font-medium sm:pr-5">{x.thCategory}</th>
                        <th className="py-2 font-medium">{x.thReason}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.map((e) => (
                        <tr key={e.id} className="border-b border-border/70 align-top">
                          <td className="py-2.5 pr-3 font-mono text-[13px] [overflow-wrap:anywhere] sm:pr-5">{partialMask(e.text)}</td>
                          <td className="py-2.5 pr-3 sm:pr-5">{x.cats[catOf(e.category).id]}</td>
                          <td className="py-2.5 text-muted-foreground [overflow-wrap:anywhere]">{reason(e)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {summary && (
                  <div className="mt-7 border-l border-border pl-4">
                    <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{x.modelExpl}</h3>
                    <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{summary}</p>
                  </div>
                )}
              </div>
            </section>
          )}
        </main>

        <footer className="pb-6 text-center text-sm text-muted-foreground"><div className="mx-auto max-w-6xl px-4 sm:px-6"><div className="border-t pt-6"><p>Lethe</p></div></div></footer>
        {dragging && <div aria-hidden="true" className="pointer-events-none fixed inset-3 z-40 grid place-items-center rounded-lg border-2 border-dashed border-primary bg-background/90 text-primary"><p className="px-5 text-center text-xl font-semibold">{u.dropTitle}</p></div>}
      </div>
    </div>
  );
}
