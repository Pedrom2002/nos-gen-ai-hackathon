import { Settings as Gear, Sun, Moon, Monitor, RotateCcw, Palette, Languages } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LANGS } from "@/lib/i18n";
import { UI } from "@/lib/i18n-ui";
import { useSettings } from "@/lib/settings";

function Section({ icon: Icon, title, children }: { icon: typeof Gear; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t pt-5 first:border-0 first:pt-0">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Icon className="h-4 w-4" />{title}</h2>
      {children}
    </section>
  );
}


export function SettingsSheet() {
  const { s, set, reset, t } = useSettings();
  const u = UI[s.lang];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" aria-label={t.settings} className="group inline-flex items-center gap-2 rounded-md text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:text-primary data-[state=open]:bg-primary/10 data-[state=open]:text-primary">
          <span className="grid h-7 w-7 place-items-center rounded-md text-xs font-semibold">
            <Gear className="h-4 w-4 transition-transform duration-500 ease-out group-hover:rotate-90 group-data-[state=open]:rotate-90" />
          </span>
          {t.settings}
        </Button>
      </SheetTrigger>
      <SheetContent side={LANGS.find((l) => l.id === s.lang)?.rtl ? "left" : "right"} closeLabel={u.close} aria-describedby={undefined} className="h-dvh w-full max-w-full overflow-y-auto overscroll-contain sm:max-w-md">
        <SheetHeader><SheetTitle>{t.settings}</SheetTitle></SheetHeader>
        <div className="mt-6 space-y-6 px-1 pb-6">
          <Section icon={Palette} title={t.appearance}>
            <div>
              <Label className="mb-2 block">{t.theme}</Label>
              <div className="grid grid-cols-3 gap-2">
                {([["light", Sun, t.light], ["dark", Moon, t.dark], ["system", Monitor, t.system]] as const).map(([id, Icon, label]) => (
                  <Button variant="ghost" key={id} aria-pressed={s.theme === id} onClick={() => set({ theme: id })} className={`flex h-auto min-h-16 min-w-0 flex-col items-center gap-1 rounded-xl border p-3 text-xs transition ${s.theme === id ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted"}`}>
                    <Icon className="h-4 w-4" />{label}
                  </Button>
                ))}
              </div>
            </div>
          </Section>

          <Section icon={Languages} title={t.language}>
            <div className="grid grid-cols-2 gap-2">
              {LANGS.map((l) => (
                <Button variant="ghost" key={l.id} aria-pressed={s.lang === l.id} onClick={() => set({ lang: l.id })} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${s.lang === l.id ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted"}`}>
                  <span className="shrink-0">{l.flag}</span><span className="min-w-0 whitespace-normal break-words">{l.label}</span>
                </Button>
              ))}
            </div>
          </Section>

          <Button variant="ghost" onClick={reset} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-muted">
            <RotateCcw className="h-4 w-4" />{t.reset}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
