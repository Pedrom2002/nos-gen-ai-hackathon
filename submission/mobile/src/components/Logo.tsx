// The Lethe wordmark and mark, drawn from the same path data as the web.
import Svg, { Path } from "react-native-svg";

import { MARK, WORDMARK } from "@web/lib/brand";

export function Wordmark({ height = 28, color }: { height?: number; color: string }) {
  return (
    <Svg width={(height * WORDMARK.w) / WORDMARK.h} height={height} viewBox={`0 0 ${WORDMARK.w} ${WORDMARK.h}`}
      accessibilityRole="image" accessibilityLabel="Lethe">
      <Path d={WORDMARK.d} fill={color} fillRule="evenodd" />
    </Svg>
  );
}

export function Mark({ size = 24, color }: { size?: number; color: string }) {
  return (
    <Svg width={(size * MARK.w) / MARK.h} height={size} viewBox={`0 0 ${MARK.w} ${MARK.h}`} accessibilityElementsHidden>
      <Path d={MARK.d} fill={color} fillRule="evenodd" />
    </Svg>
  );
}
