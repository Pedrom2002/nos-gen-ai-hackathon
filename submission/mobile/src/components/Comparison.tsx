// Original and anonymised, as in the web: one panel under the other ("Lado a
// lado" on a phone) or one over the other with a wavy edge to drag ("Deslizar").
// Works for text and for the photo and its redacted copy.
import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, PanResponder, Platform, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useSettings } from "@/settings";
import { useColors } from "@/ui";

/** Masks drawn in the primary colour, as the web shows them. */
export function MaskedText({ text, mono = true }: { text: string; mono?: boolean }) {
  const c = useColors();
  const parts = text.split("*");
  return (
    <Text selectable style={{ color: c.foreground, fontFamily: mono ? "monospace" : undefined, fontSize: 13, lineHeight: 22 }}>
      {parts.map((part, i) => (
        <Text key={i}>
          {part}
          {i < parts.length - 1 ? <Text style={{ color: c.primary, fontWeight: "700" }}>*</Text> : null}
        </Text>
      ))}
    </Text>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.card, padding: 14, gap: 10 }}>
      <Text style={{ color: c.mutedForeground, fontWeight: "600", fontSize: 13 }}>{title}</Text>
      {children}
    </View>
  );
}

/** The web's river edge: three wavy strokes that sway over the cut between
 * the two layers. Still when the system asks for reduced motion. */
function RiverEdge({ x, width, height, color }: { x: number; width: number; height: number; color: string }) {
  const [time, setTime] = useState(0);
  useEffect(() => {
    let raf = 0;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((still) => {
      if (still || !alive) return;
      const tick = (now: number) => { setTime(now / 1000); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    }).catch(() => {});
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, []);
  if (x <= 0 || x >= width || height <= 0) return null;
  const edge = (y: number, phase: number) => x + Math.sin(y / 46 + time * 2.2 + phase) * 9 + Math.sin(y / 17 - time * 3.1 + phase) * 3.5;
  const path = (phase: number, shift: number) => {
    const d: string[] = [];
    for (let y = 0; y <= height + 8; y += 8) d.push(`${d.length ? "L" : "M"}${Math.max(0, edge(y, phase) - shift).toFixed(1)} ${y}`);
    return d.join(" ");
  };
  return (
    <Svg pointerEvents="none" width={width} height={height} style={{ position: "absolute", top: 0, left: 0 }}>
      <Path d={path(1.3, 9)} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={14} strokeLinecap="round" />
      <Path d={path(0.6, 5)} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={5} />
      <Path d={path(0, 0)} fill="none" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

/** Original under, anonymised on top, cut at a wavy edge the person drags,
 * as the web's river slider. The document scrolls inside a window of fixed
 * height, so the handle stays in its middle and is always in view; on
 * opening, the anonymised side flows in up to half. For text, give the top
 * layer alignedMask() so both layers wrap at the same places. */
export function Slider({ under, over, label, height }: {
  under: ReactNode; over: ReactNode; label: string; height?: number;
}) {
  const c = useColors();
  const { u } = useSettings();
  const screen = useWindowDimensions();
  const viewport = height ?? Math.round(screen.height * 0.6);
  const [width, setWidth] = useState(0);
  const [position, setPosition] = useState(0);
  const positionRef = useRef(position);
  positionRef.current = position;
  const widthRef = useRef(width);
  widthRef.current = width;
  const start = useRef(0);
  const reveal = useRef(0);
  const cancelReveal = () => cancelAnimationFrame(reveal.current);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((still) => {
      if (!alive) return;
      if (still) { setPosition(0.5); return; }
      let began: number | undefined;
      const animate = (now: number) => {
        began ??= now;
        const progress = Math.min((now - began) / 1800, 1);
        setPosition((1 - Math.cos(progress * Math.PI)) / 4);
        if (progress < 1) reveal.current = requestAnimationFrame(animate);
      };
      reveal.current = requestAnimationFrame(animate);
    }).catch(() => setPosition(0.5));
    return () => { alive = false; cancelAnimationFrame(reveal.current); };
  }, []);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // The page scrolls vertically: keep the drag once it has started.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { cancelReveal(); start.current = positionRef.current; },
    onPanResponderMove: (_e, g) => {
      const w = widthRef.current || 1;
      setPosition(Math.min(1, Math.max(0, start.current + g.dx / w)));
    },
  })).current;

  const step = (delta: number) => { cancelReveal(); setPosition((p) => Math.min(1, Math.max(0, p + delta))); };
  const cut = width * position;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.card, overflow: "hidden", height: viewport }}
    >
      {/* A web scroll bar takes width from the bottom layer only and would make
          the two layers wrap apart; phones draw it over the content. */}
      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={Platform.OS !== "web"} accessibilityLabel={label}>
        <View style={{ padding: 14 }}>{under}</View>
        <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: cut, overflow: "hidden", backgroundColor: c.card }}>
          <View style={{ width, padding: 14 }}>{over}</View>
        </View>
      </ScrollView>
      <RiverEdge x={cut} width={width} height={viewport} color={c.primary} />
      <View
        {...pan.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={u.riverDivider}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(position * 100) }}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 0.1 : -0.1)}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        hitSlop={14}
        style={{
          position: "absolute", top: viewport / 2 - 22, left: Math.min(Math.max(cut - 22, 0), Math.max(width - 44, 0)),
          width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: c.primary, backgroundColor: c.card,
          alignItems: "center", justifyContent: "center",
          shadowColor: c.primary, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6,
        }}
      >
        <Feather name="code" size={18} color={c.primary} />
      </View>
    </View>
  );
}

export function Photo({ uri, label }: { uri: string; label: string }) {
  return <Image source={{ uri }} accessibilityLabel={label} contentFit="contain" style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: 8 }} />;
}
