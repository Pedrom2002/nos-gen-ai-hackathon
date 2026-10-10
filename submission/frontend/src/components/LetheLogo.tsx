import { useId } from "react";

// Wave that thins and fades to the right, dissolving into ever smaller, fainter asterisks.
export const LOGO_STARS = [
  { x: 20.5, y: 15.5, s: 7.5, o: 0.85 },
  { x: 24.2, y: 19.6, s: 6, o: 0.6 },
  { x: 26.4, y: 12.4, s: 4.6, o: 0.42 },
  { x: 28.9, y: 17.2, s: 3.6, o: 0.28 },
  { x: 30.3, y: 10.6, s: 2.8, o: 0.17 },
  { x: 31.4, y: 14.6, s: 2.2, o: 0.1 },
];
export const LOGO_WAVE = "M2.5 18c3-5 6-5 9 0s5.5 4.4 8 1.2";

export function LetheLogo({ className = "h-6 w-6" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={`text-primary ${className}`}>
      <defs>
        <linearGradient id={`lw${id}`} x1="2" y1="0" x2="20" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="currentColor" />
          <stop offset=".65" stopColor="currentColor" stopOpacity=".9" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".35" />
        </linearGradient>
      </defs>
      <path d={LOGO_WAVE} stroke={`url(#lw${id})`} strokeWidth="2.6" strokeLinecap="round" />
      <g fill="currentColor" fontFamily="Arial" fontWeight="700" textAnchor="middle">
        {LOGO_STARS.map((st, i) => (
          <text key={i} x={st.x} y={st.y} fontSize={st.s} opacity={st.o}>*</text>
        ))}
      </g>
    </svg>
  );
}
