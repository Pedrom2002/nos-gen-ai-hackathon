// Visual building blocks with the web frontend's palette (styles.css, oklch
// converted to sRGB). Touch targets are at least 44 pt and every control has
// an accessible label.
import type { ReactNode } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View,
  type StyleProp, type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { CategoryId } from "@web/lib/anonymizer";

import { useSettings } from "@/settings";

const LIGHT = {
  background: "#fafafa", foreground: "#222222", card: "#ffffff", primary: "#2279dc", primaryForeground: "#fcfcfc",
  muted: "#f0f0f0", mutedForeground: "#636363", destructive: "#e62b34", border: "#dbdbdb", success: "#24a965", warning: "#e99b2a",
};
const DARK: typeof LIGHT = {
  background: "#121212", foreground: "#eeeeee", card: "#181818", primary: "#5fa7ff", primaryForeground: "#061223",
  muted: "#222222", mutedForeground: "#9e9e9e", destructive: "#e62b34", border: "#333333", success: "#24a965", warning: "#e99b2a",
};
export type Colors = typeof LIGHT;

export const CATEGORY_COLORS: Record<CategoryId, string> = {
  nome: "#2393f1", data: "#da950b", identificador: "#9260da", contacto: "#00aa9a", morada: "#4aa651",
  saude: "#e93a4e", financeiro: "#eb7c33", biometrico: "#b05baa", religiao_etnia: "#6d71c0", outro: "#77818c",
};

export function useColors(): Colors & { dark: boolean } {
  const { s } = useSettings();
  const system = useColorScheme();
  const dark = s.theme === "dark" || (s.theme === "system" && system === "dark");
  return { ...(dark ? DARK : LIGHT), dark };
}

/** A scrolling screen inside the safe area. */
export function Screen({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text accessibilityRole="header" style={[styles.title, { color: c.foreground }]}>{children}</Text>;
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const c = useColors();
  return <Text style={[styles.body, { color: muted ? c.mutedForeground : c.foreground }]}>{children}</Text>;
}

type Variant = "primary" | "outline" | "ghost";

export function Button({ label, onPress, variant = "outline", disabled = false, busy = false, hint, style }: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  /** Read by screen readers after the label. */
  hint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const primary = variant === "primary";
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? c.primary : variant === "outline" ? c.card : "transparent",
          borderColor: variant === "outline" ? c.border : "transparent",
          opacity: off ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {busy && <ActivityIndicator color={primary ? c.primaryForeground : c.primary} />}
      <Text style={[styles.buttonText, { color: primary ? c.primaryForeground : c.foreground }]}>{label}</Text>
    </Pressable>
  );
}

/** An inline message: what happened and, for errors, what to do. */
export function Notice({ text, tone = "info" }: { text: string; tone?: "info" | "warning" | "error" | "success" }) {
  const c = useColors();
  const color = { info: c.primary, warning: c.warning, error: c.destructive, success: c.success }[tone];
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : "text"}
      accessibilityLiveRegion="polite"
      style={[styles.notice, { borderColor: color, backgroundColor: c.card }]}
    >
      <Text style={[styles.body, { color: c.foreground }]}>{text}</Text>
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>{children}</View>;
}

/** Shown in the header while results are simulated, as in the web app. */
export function DemoBadge({ label }: { label: string }) {
  const c = useColors();
  return (
    <View accessibilityRole="text" accessibilityLabel={label} style={[styles.badge, { borderColor: c.warning }]}>
      <Text numberOfLines={1} style={{ color: c.warning, fontSize: 12, fontWeight: "600" }}>Demo</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, gap: 16 },
  title: { fontSize: 24, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 24 },
  button: {
    minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  buttonText: { fontSize: 16, fontWeight: "600" },
  notice: { borderLeftWidth: 4, borderWidth: 1, borderRadius: 10, padding: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginRight: 8 },
});
