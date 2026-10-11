// Settings, as in the web: appearance with three theme cards, the language
// grid with country codes and a reset; plus the API address (with a
// connection test), which only the phone needs.
import Feather from "@expo/vector-icons/Feather";
import { useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { LANGS } from "@web/lib/i18n";

import { appDefaultApiUrl } from "@/address";
import { createClient, normalizeBase } from "@/api";
import { DEFAULTS, useSettings, type Theme } from "@/settings";
import { Body, Button, Notice, Screen, useColors, type IconName } from "@/ui";

/** "🇵🇹" → "PT": the regional indicator letters of a flag. */
function countryCode(flag: string): string {
  return [...flag].map((ch) => String.fromCharCode((ch.codePointAt(0) ?? 0) - 0x1f1e6 + 65)).join("");
}

function Section({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Feather name={icon} size={16} color={c.mutedForeground} />
        <Text accessibilityRole="header" style={{ color: c.mutedForeground, fontWeight: "700", fontSize: 14 }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Choice({ selected, label, onPress, children, style }: {
  selected: boolean; label: string; onPress: () => void; children: ReactNode; style?: object;
}) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={label} onPress={onPress}
      style={[{
        minHeight: 44, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8,
        borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.muted : c.card,
      }, style]}>
      {children}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { s, set, t, m } = useSettings();
  const c = useColors();
  const [url, setUrl] = useState(s.apiUrl);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  // Used while the field is empty (address set on the computer or same Wi-Fi).
  const automatic = appDefaultApiUrl();

  const saveUrl = () => {
    const clean = normalizeBase(url);
    setUrl(clean);
    set({ apiUrl: clean });
    return clean;
  };

  const test = async () => {
    const clean = saveUrl() || automatic;
    setTesting(true);
    setStatus(null);
    const ok = await createClient(clean, fetch, 15_000).health();
    setStatus(ok ? { ok, text: m.connected } : { ok, text: "Não foi possível ligar ao servidor. Confirme o endereço nas definições." });
    setTesting(false);
  };

  const themes: [Theme, string, IconName][] = [["light", t.light, "sun"], ["dark", t.dark, "moon"], ["system", t.system, "monitor"]];
  const divider = <View style={{ height: 1, backgroundColor: c.border }} />;
  return (
    <Screen>
      <Section icon="sliders" title={t.appearance}>
        <Text style={{ color: c.foreground, fontSize: 15 }}>{t.theme}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={t.theme} style={{ flexDirection: "row", gap: 8 }}>
          {themes.map(([id, label, icon]) => {
            const on = s.theme === id;
            return (
              <Choice key={id} selected={on} label={label} onPress={() => set({ theme: id })} style={{ flex: 1, minHeight: 64, gap: 6 }}>
                <Feather name={icon} size={18} color={c.foreground} />
                <Text style={{ color: c.foreground, fontWeight: on ? "700" : "500", fontSize: 13 }}>{label}</Text>
              </Choice>
            );
          })}
        </View>
      </Section>

      {divider}

      <Section icon="globe" title={t.language}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t.language} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {LANGS.map((lang) => {
            const on = s.lang === lang.id;
            return (
              <Choice key={lang.id} selected={on} label={lang.label} onPress={() => set({ lang: lang.id })}
                style={{ flexBasis: "47%", flexGrow: 1, flexDirection: "row", gap: 8 }}>
                <Text style={{ color: c.mutedForeground, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 }}>{countryCode(lang.flag)}</Text>
                <Text numberOfLines={1} style={{ color: c.foreground, fontWeight: on ? "700" : "500" }}>{lang.label}</Text>
              </Choice>
            );
          })}
        </View>
      </Section>

      {divider}

      <Section icon="server" title={m.apiUrl}>
        <Body muted>{m.apiUrlHint}</Body>
        <TextInput
          accessibilityLabel={m.apiUrl}
          value={url}
          onChangeText={setUrl}
          onEndEditing={saveUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder={automatic || "abc.trycloudflare.com"}
          placeholderTextColor={c.mutedForeground}
          style={{ minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, color: c.foreground, fontSize: 16, backgroundColor: c.card }}
        />
        <Button icon="activity" label={m.testConnection} onPress={test} busy={testing} disabled={!url.trim() && !automatic} />
        {status ? <Notice tone={status.ok ? "success" : "error"} text={status.text} /> : null}
      </Section>

      {divider}

      {/* Theme and language back to the defaults; the API address stays. */}
      <Button icon="rotate-ccw" label={t.reset} onPress={() => set({ theme: DEFAULTS.theme, lang: DEFAULTS.lang })} />
    </Screen>
  );
}
