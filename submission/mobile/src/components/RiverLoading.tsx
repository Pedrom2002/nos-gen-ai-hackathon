// "Crossing the Lethe": while the API works, a blue band sweeps over the first
// lines of the document and the status changes, as in the web. Still when
// the system asks for reduced motion.
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Text, View } from "react-native";

import { useSettings } from "@/settings";
import { useColors } from "@/ui";

const SKELETON = [0.9, 0.6, 0.95, 0.7, 0.85, 0.5, 0.8, 0.65];

export function RiverLoading({ text }: { text: string }) {
  const { t, u } = useSettings();
  const c = useColors();
  const [message, setMessage] = useState(0);
  const [width, setWidth] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loops: Animated.CompositeAnimation[] = [];
    const status = setInterval(() => setMessage((n) => (n + 1) % u.loadingMessages.length), 1500);
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loops = [
        Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 2800, easing: Easing.linear, useNativeDriver: true })),
        Animated.loop(Animated.timing(progress, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true })),
      ];
      loops.forEach((l) => l.start());
    }).catch(() => {});
    return () => { clearInterval(status); loops.forEach((l) => l.stop()); };
  }, [sweep, progress, u.loadingMessages.length]);

  const lines = text.trim() ? text.split(/\r?\n/).slice(0, 8) : null;
  const bandWidth = width * 0.3;
  return (
    <View accessible accessibilityLabel={t.analyzing} accessibilityState={{ busy: true }} style={{ gap: 14 }}>
      <Text style={{ color: c.foreground, fontSize: 20, fontWeight: "700", textAlign: "center" }}>
        {t.analyzing}
      </Text>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ overflow: "hidden", borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.card, padding: 18, minHeight: 220 }}
      >
        {lines
          ? lines.map((line, i) => (
            <Text key={i} numberOfLines={1} style={{ color: c.mutedForeground, fontFamily: "monospace", fontSize: 12, lineHeight: 26 }}>{line || " "}</Text>
          ))
          : SKELETON.map((w, i) => (
            <View key={i} style={{ height: 10, width: `${w * 100}%`, borderRadius: 5, backgroundColor: c.muted, marginVertical: 8 }} />
          ))}
        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute", top: 0, bottom: 0, width: bandWidth, left: 0,
              backgroundColor: c.primary, opacity: 0.22, borderRadius: 40,
              transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-bandWidth, width] }) }, { skewX: "-12deg" }],
            }}
          />
        ) : null}
      </View>
      <View style={{ height: 3, borderRadius: 2, overflow: "hidden", backgroundColor: c.muted }}>
        <Animated.View style={{
          height: 3, width: "33%", backgroundColor: c.primary,
          transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-130, Math.max(width, 300)] }) }],
        }} />
      </View>
      <Text accessibilityLiveRegion="polite" style={{ color: c.mutedForeground, textAlign: "center", fontSize: 14 }}>
        {u.loadingMessages[message]}
      </Text>
    </View>
  );
}
