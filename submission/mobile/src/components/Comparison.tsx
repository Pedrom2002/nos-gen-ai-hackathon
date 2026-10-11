// Original and anonymised, as in the web: one panel under the other ("Lado a
// lado" on a phone) or one over the other with a handle to drag ("Deslizar").
// Works for text and for the photo and its redacted copy.
import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { useRef, useState, type ReactNode } from "react";
import { PanResponder, Text, View } from "react-native";

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

/** Original under, anonymised on top, cut at a handle the person drags.
 * For text, pass `lines`: each original line carries its masked line on top,
 * so both stay aligned even though the masked one wraps shorter. */
export function Slider({ under, over, lines, label, height }: {
  under?: ReactNode; over?: ReactNode; lines?: [string, string][]; label: string; height?: number;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const [position, setPosition] = useState(0.5);
  const positionRef = useRef(position);
  positionRef.current = position;
  const widthRef = useRef(width);
  widthRef.current = width;
  const start = useRef(0.5);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = positionRef.current; },
    onPanResponderMove: (_e, g) => {
      const w = widthRef.current || 1;
      setPosition(Math.min(1, Math.max(0, start.current + g.dx / w)));
    },
  })).current;

  const step = (delta: number) => setPosition((p) => Math.min(1, Math.max(0, p + delta)));
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.card, overflow: "hidden", height }}
    >
      {lines ? (
        <View style={{ padding: 14 }}>
          {lines.map(([original, masked], i) => (
            <View key={i}>
              <Text style={{ color: c.foreground, fontFamily: "monospace", fontSize: 13, lineHeight: 22 }}>{original || " "}</Text>
              <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: Math.max(0, width * position - 14), overflow: "hidden", backgroundColor: c.card }}>
                <View style={{ width: width - 28 }}><MaskedText text={masked || " "} /></View>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <>
          <View style={{ padding: 14 }}>{under}</View>
          <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: width * position, overflow: "hidden", backgroundColor: c.card }}>
            <View style={{ width, padding: 14 }}>{over}</View>
          </View>
        </>
      )}
      <View
        {...pan.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(position * 100) }}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 0.1 : -0.1)}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        style={{ position: "absolute", top: 0, bottom: 0, left: width * position - 22, width: 44, alignItems: "center", justifyContent: "center" }}
      >
        <View style={{ position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: c.primary }} />
        <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: c.primary, backgroundColor: c.card, alignItems: "center", justifyContent: "center" }}>
          <Feather name="code" size={16} color={c.primary} />
        </View>
      </View>
    </View>
  );
}

export function Photo({ uri, label }: { uri: string; label: string }) {
  return <Image source={{ uri }} accessibilityLabel={label} contentFit="contain" style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: 8 }} />;
}
