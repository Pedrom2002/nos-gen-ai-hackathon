import type { PageGeometry, RedactionBox } from "@/lib/document";

interface Props {
  pages: PageGeometry[];
  /** One object URL per page, null while it renders. */
  urls: (string | null)[];
  /**
   * The page as the backend redacted it (a verified PNG), per page. When a
   * page has one, the redacted half shows that file instead of painting
   * boxes over the original, so the preview is the download itself.
   */
  redactedUrls?: (string | null)[];
  boxes: RedactionBox[];
  /** "redacted" paints every box black; "original" only outlines the focused entity. */
  mode: "original" | "redacted";
  focusId?: string;
  pageLabel: (n: number) => string;
}

// The pages of the source document as images, with an SVG overlay in page
// units on top of each one. The same component renders both halves of the
// comparison, so the two layers always have identical size.
export function PageStack({ pages, urls, redactedUrls = [], boxes, mode, focusId = "", pageLabel }: Props) {
  return (
    <ol className="space-y-4 p-3 sm:p-4">
      {pages.map((page, i) => {
        const own = boxes.filter((b) => b.page === i);
        const backend = mode === "redacted" ? redactedUrls[i] ?? null : null;
        const src = backend ?? urls[i];
        return (
          <li key={i} className="relative mx-auto w-full max-w-[900px] overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/10" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
            {src
              ? <img src={src} alt={pageLabel(i + 1)} draggable={false} className="block h-full w-full select-none" />
              : <div aria-label={pageLabel(i + 1)} className="h-full w-full animate-pulse bg-muted" />}
            <svg aria-hidden="true" viewBox={`0 0 ${page.width} ${page.height}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
              {own.map((b, k) => {
                const focused = !!focusId && b.entityId === focusId;
                // The backend's file already has its bars: only outline the focused entity over it.
                if ((mode === "original" || backend) && !focused) return null;
                return mode === "redacted" && !backend
                  ? <rect key={k} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.h * 0.12} fill="#111" className="lethe-wash" style={{ animationDelay: `${Math.min(k * 40, 1600)}ms` }} stroke={focused ? "var(--primary)" : "none"} strokeWidth={focused ? 3 : 0} vectorEffect="non-scaling-stroke" {...(focused ? { "data-focus-mark": "" } : {})} />
                  : <rect key={k} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.h * 0.12} fill={backend ? "none" : "var(--primary)"} fillOpacity={0.3} stroke="var(--primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" data-focus-mark="" />;
              })}
            </svg>
          </li>
        );
      })}
    </ol>
  );
}
