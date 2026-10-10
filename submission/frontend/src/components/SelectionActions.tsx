import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CATEGORIES, type CategoryId } from "@/lib/anonymizer";
import { useSettings } from "@/lib/settings";
import { UI } from "@/lib/i18n-ui";
import { EXTRA } from "@/lib/i18n-extra";

export interface ReviewSelection { text: string; range: Range }
export function SelectionActions({ selection, touch, onClose, onAdd }: {
  selection: ReviewSelection; touch: boolean; onClose: () => void;
  onAdd: (text: string, category: CategoryId) => void;
}) {
  const { s } = useSettings();
  const u = UI[s.lang];
  const x = EXTRA[s.lang];
  const [category, setCategory] = useState<CategoryId>("nome");
  const virtual = useRef({ getBoundingClientRect: () => selection.range.getBoundingClientRect() });
  virtual.current.getBoundingClientRect = () => selection.range.getBoundingClientRect();
  useEffect(() => {
    const initialTop = selection.range.getBoundingClientRect().top;
    const scroll = () => {
      const rect = selection.range.getBoundingClientRect();
      if (Math.abs(rect.top - initialTop) > 160 || rect.bottom < 0 || rect.top > window.innerHeight) onClose();
    };
    window.addEventListener("scroll", scroll, true);
    return () => window.removeEventListener("scroll", scroll, true);
  }, [selection, onClose]);
  const controls = <div data-selection-actions className="min-w-0">
    <p title={selection.text} className="mb-3 truncate font-mono text-xs text-muted-foreground">“{selection.text}”</p>
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
      <select aria-label={x.thCategory} value={category} onChange={(e) => setCategory(e.target.value as CategoryId)} className="h-10 min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{x.cats[c.id]}</option>)}
      </select>
      <Button aria-label={u.markSensitive} onClick={() => { onAdd(selection.text, category); onClose(); }}>{u.mark}</Button>
      {!touch && <Button variant="ghost" size="icon" aria-label={u.close} onClick={onClose}><X className="size-4" /></Button>}
    </div>
  </div>;
  if (touch) return <Sheet open onOpenChange={(open) => { if (!open) onClose(); }} modal={false}>
    <SheetContent side="bottom" closeLabel={u.close} aria-describedby={undefined} onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()} className="rounded-t-lg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
      <SheetTitle className="mb-3 text-sm">{u.markSensitive}</SheetTitle>{controls}
    </SheetContent>
  </Sheet>;
  return <Popover open onOpenChange={(open) => { if (!open) onClose(); }}>
    <PopoverAnchor virtualRef={virtual} />
    <PopoverContent side="top" sideOffset={10} collisionPadding={12} aria-label={u.markSensitive} onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()} className="selection-actions w-80 max-w-[calc(100vw-24px)] p-3">{controls}</PopoverContent>
  </Popover>;
}
