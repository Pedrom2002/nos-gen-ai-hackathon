import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, ArrowRight, Check, Keyboard, List, Redo2, Undo2, X } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { EXTRA } from "@/lib/i18n-extra";
import { UI } from "@/lib/i18n-ui";
import { CATEGORIES, catOf, findSpans, type CategoryId, type Entity } from "@/lib/anonymizer";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SelectionActions, type ReviewSelection } from "@/components/SelectionActions";

interface Props {
  backLabel: string;
  generateLabel: string;
  onBack: () => void;
  onGenerate: () => void;
  text: string;
  entities: Entity[];
  onToggle: (id: string) => void;
  onToggleCategory: (cat: CategoryId, enabled: boolean) => void;
  onAdd: (text: string, category: CategoryId) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function ReviewPanel({ backLabel, generateLabel, onBack, onGenerate, text, entities, onToggle, onToggleCategory, onAdd, onUndo, onRedo, canUndo, canRedo }: Props) {
  const { s, t } = useSettings();
  const x = EXTRA[s.lang];
  const u = UI[s.lang];
  const spans = useMemo(() => findSpans(text, entities), [text, entities]);
  const [selection, setSelection] = useState<ReviewSelection | null>(null);
  const [touch, setTouch] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filters, setFilters] = useState<CategoryId[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeSelection = useCallback(() => { setSelection(null); window.getSelection()?.removeAllRanges(); }, []);
  const captureSelection = () => {
    const selected = window.getSelection();
    if (!selected || !boxRef.current || !selected.anchorNode || !selected.focusNode) return;
    if (boxRef.current.contains(selected.anchorNode) && boxRef.current.contains(selected.focusNode) && selected.rangeCount && selected.toString().trim()) {
      setSelection({ text: selected.toString().trim(), range: selected.getRangeAt(0).cloneRange() });
    }
  };
  useEffect(() => {
    try {
      const mq = window.matchMedia("(pointer: coarse)");
      setTouch(mq.matches);
      const update = () => setTouch(mq.matches);
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    } catch { return; }
  }, []);
  useEffect(() => {
    document.addEventListener("selectionchange", captureSelection);
    return () => document.removeEventListener("selectionchange", captureSelection);
  }, []);

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement && (target.closest("input:not([type=checkbox]), textarea, select, [contenteditable=true], [data-selection-actions]") || (!rootRef.current?.contains(target) && !target.closest("[data-entity-drawer]") && target !== document.body))) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault(); if (e.shiftKey) onRedo(); else onUndo(); return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (!["j", "k", "ArrowDown", "ArrowUp"].includes(e.key)) return;
      const scope = drawerOpen ? document.querySelector("[data-entity-drawer]") : rootRef.current;
      const items = Array.from(scope?.querySelectorAll<HTMLElement>("[data-review-entity]") ?? []).filter((el) => el.getClientRects().length > 0);
      if (!items.length) return;
      e.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLElement);
      const forward = e.key === "j" || e.key === "ArrowDown";
      const nextIndex = index < 0 ? (forward ? 0 : items.length - 1) : (index + (forward ? 1 : -1) + items.length) % items.length;
      const next = items[nextIndex];
      next?.focus({ preventScroll: true }); next?.scrollIntoView({ block: "nearest", behavior: "auto" });
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [onUndo, onRedo, drawerOpen]);

  const parts: React.ReactNode[] = [];
  let cur = 0;
  spans.forEach((span, i) => {
    if (span.start > cur) parts.push(text.slice(cur, span.start));
    const c = catOf(span.entity.category);
    const enabled = span.entity.enabled;
    const dim = filters.length > 0 && !filters.includes(c.id);
    parts.push(
      <mark key={`${span.entity.id}-${i}`} role="button" tabIndex={0} data-review-entity={span.entity.id}
        aria-pressed={enabled} aria-label={`${x.cats[c.id]}: ${enabled ? u.enabled : u.disabled}`}
        title={`${x.cats[c.id]} — ${span.entity.manual ? x.manual : span.entity.reason || x.toggleHint}`}
        onClick={() => onToggle(span.entity.id)} onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(span.entity.id); }
        }}
        className={`entity-mark text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${enabled ? (dim ? "entity-muted" : "") : "entity-off"}`}
        style={{ ["--c" as string]: c.color }}>
        {text.slice(span.start, span.end)}
      </mark>,
    );
    cur = span.end;
  });
  parts.push(text.slice(cur));
  const grouped = CATEGORIES.map((c) => ({ c, items: entities.filter((e) => e.category === c.id) })).filter((g) => g.items.length);
  const shortcuts = [["J / ↓", u.nextEntity], ["K / ↑", u.prevEntity], [`${u.spaceKey} / Enter`, u.toggleEntity], ["Ctrl / ⌘ + Z", u.undo], ["Ctrl / ⌘ + Shift + Z", u.redo]];

  const entityList = <div className="space-y-3">
          {grouped.length === 0 && <p className="text-sm text-muted-foreground">{x.noEntities}</p>}
          {grouped.map(({ c, items }) => {
            const count = items.filter((i) => i.enabled).length;
            return <div key={c.id} className="border-b pb-4">
              <label className="mb-2 flex min-h-11 cursor-pointer items-center gap-2">
                <input type="checkbox" checked={count === items.length} ref={(el) => { if (el) el.indeterminate = count > 0 && count < items.length; }} onChange={(e) => onToggleCategory(c.id, e.target.checked)} className="accent-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} /><span className="font-semibold">{x.cats[c.id]}</span><span className="ml-auto text-xs text-muted-foreground">{count}/{items.length}</span>
              </label>
              <ul className="space-y-2">{items.map((entity) => <li key={entity.id}>
                <Button variant="ghost" data-review-entity={entity.id} aria-pressed={entity.enabled} aria-label={`${x.cats[c.id]}: ${entity.enabled ? u.enabled : u.disabled} — ${entity.text}`} onClick={() => onToggle(entity.id)} className="h-auto w-full items-start justify-start gap-3 whitespace-normal px-2 py-2 text-start font-normal focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <span className="mt-1 grid size-4 shrink-0 place-items-center rounded-sm border border-primary" aria-hidden="true">{entity.enabled && <Check className="size-3 text-primary" />}</span>
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]"><span className={`font-mono text-sm ${entity.enabled ? "" : "line-through opacity-60"}`}>{entity.text}</span>{entity.manual && <span className="ml-1 text-xs text-primary">({u.manualTag})</span>}
                    {(entity.reason || entity.manual) && <span className="block text-xs leading-5 text-muted-foreground">{entity.manual ? x.manual : entity.reason}</span>}
                  </span>
                </Button>
              </li>)}</ul>
            </div>;
          })}
        </div>;

  return (
    <div ref={rootRef}>
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} aria-label={u.undo} title={u.undo}><Undo2 className="size-4" /></Button>
          <Button variant="ghost" size="icon" onClick={onRedo} disabled={!canRedo} aria-label={u.redo} title={u.redo}><Redo2 className="size-4" /></Button>
        </div>
        <Popover>
          <PopoverTrigger asChild><Button variant="ghost" className="text-xs text-muted-foreground"><Keyboard className="size-4" />{u.shortcuts}</Button></PopoverTrigger>
          <PopoverContent align="end" className="max-w-[calc(100vw-32px)]">
            <h2 className="mb-3 text-sm font-semibold">{u.shortcuts}</h2>
            <ul className="space-y-3 text-xs">{shortcuts.map(([key, label]) => <li key={key} className="flex justify-between gap-4"><span>{label}</span><kbd className="shrink-0 font-mono text-muted-foreground">{key}</kbd></li>)}</ul>
          </PopoverContent>
        </Popover>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 rounded-lg border bg-card p-4 sm:p-5 lg:min-h-[75dvh]">
          {grouped.length > 0 && <div className="category-scroll mb-5 flex flex-nowrap gap-2 overflow-x-auto border-b px-1 pb-4 lg:flex-wrap" role="group" aria-label={u.categoryFilter}>
            {grouped.map(({ c, items }) => {
              const on = filters.includes(c.id);
              return <Button key={c.id} variant="outline" aria-pressed={on} onClick={() => setFilters((old) => on ? old.filter((id) => id !== c.id) : [...old, c.id])}
                className={`h-auto min-h-9 shrink-0 gap-2 whitespace-nowrap px-2.5 py-1 text-xs ${on ? "border-[var(--c)] bg-[color-mix(in_oklch,var(--c)_18%,transparent)] hover:bg-[color-mix(in_oklch,var(--c)_28%,transparent)]" : filters.length ? "text-muted-foreground" : ""}`}
                style={{ ["--c" as string]: c.color }}>
                {on ? <Check className="size-3 shrink-0" style={{ color: c.color }} /> : <span className="size-2 shrink-0 rounded-full" style={{ background: c.color }} />}{x.cats[c.id]}<span className="text-muted-foreground">{items.length}</span>
              </Button>;
            })}
            {filters.length > 0 && <Button variant="ghost" onClick={() => setFilters([])} className="h-auto min-h-9 shrink-0 gap-1.5 whitespace-nowrap px-2.5 py-1 text-xs text-muted-foreground">
              <X className="size-3" />{u.showAllCategories}
            </Button>}
          </div>}
          <div ref={boxRef} onMouseUp={captureSelection} onTouchEnd={captureSelection} className="select-text whitespace-pre-wrap break-words font-mono text-sm leading-7 [overflow-wrap:anywhere]">{parts}</div>
        </div>
        <aside className="hidden min-w-0 space-y-3 lg:block lg:max-h-[75dvh] lg:overflow-auto" aria-label={x.thEntity}>{entityList}</aside>
      </div>
      {selection && <SelectionActions selection={selection} touch={touch} onClose={closeSelection} onAdd={onAdd} />}
      <div className="review-mobile-actions fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-2 backdrop-blur-sm lg:hidden">
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild><Button variant="outline" className="mb-2 w-full"><List className="size-4" />{t.entities} ({entities.length})</Button></SheetTrigger>
          <SheetContent side="bottom" closeLabel={u.close} aria-describedby={undefined} className="max-h-[78dvh] overflow-auto rounded-t-lg pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <SheetHeader><SheetTitle>{t.entities} ({entities.length})</SheetTitle></SheetHeader>
            <div data-entity-drawer className="mt-4">{entityList}</div>
          </SheetContent>
        </Sheet>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="size-4 shrink-0" />{backLabel}</Button>
          <Button onClick={onGenerate}>{generateLabel}<ArrowRight className="size-4 shrink-0" /></Button>
        </div>
      </div>
    </div>
  );
}
