import { forwardRef } from "react";
import { MARK, WORDMARK } from "@/lib/brand";
// Hand-lettered Lethe logo, traced from the brand artwork. Both shapes use currentColor.

// The "L" alone, for places where the full word will not fit.
export function LetheLogo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${MARK.w} ${MARK.h}`} fill="currentColor" aria-hidden="true" className={`text-primary ${className}`}>
      <path fillRule="evenodd" d={MARK.d} />
    </svg>
  );
}

// The full word. Size it with a height class; the width follows the artwork's proportions.
export const LetheWordmark = forwardRef<SVGSVGElement, { className?: string; id?: string }>(function LetheWordmark({ className = "h-8", id }, ref) {
  return (
    <svg ref={ref} id={id} viewBox={`0 0 ${WORDMARK.w} ${WORDMARK.h}`} fill="currentColor" role="img" aria-label="Lethe" className={`w-auto text-primary ${className}`}>
      <path fillRule="evenodd" d={WORDMARK.d} />
    </svg>
  );
});
