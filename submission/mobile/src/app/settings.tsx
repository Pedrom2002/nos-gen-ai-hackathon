// Settings: theme, language and the API address (with a connection test).
import { useState } from "react";
import { TextInput, View } from "react-native";

import { LANGS } from "@web/lib/i18n";

import { createClient, normalizeBase } from "@/api";
import { useSettings, type Theme } from "@/settings";
import { Body, Button, Card, Notice, Screen, Title, useColors } from "@/ui";

export default function SettingsScreen() {
  const { s, set, t, m } = useSettings();
  const c = useColors();
  const [url, setUrl] = useState(s.apiUrl);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const saveUrl = () => {
    const clean = normalizeBase(url);
    setUrl(clean);
    set({ apiUrl: clean });
    return clean;
  };

  const test = async () => {
    const clean = saveUrl();
    setTesting(true);
    setStatus(null);
    const ok = await createClient(clean, fetch, 15_000).health();
    setStatus(ok ? { ok, text: m.connected } : { ok, text: "Não foi possível ligar ao servidor. Confirme o endereço nas definições." });
    setTesting(false);
  };

  const themes: [Theme, string][] = [["light", t.light], ["dark", t.dark], ["system", t.system]];
  return (
    <Screen>
      <Card>
        <Title>{m.apiUrl}</Title>
        <Body muted>{m.apiUrlHint}</Body>
        <TextInput
          accessibilityLabel={m.apiUrl}
          value={url}
          onChangeText={setUrl}
          onEndEditing={saveUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="abc.trycloudflare.com"
          placeholderTextColor={c.mutedForeground}
          style={{ minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, color: c.foreground, fontSize: 16 }}
        />
        <Button variant="primary" label={m.testConnection} onPress={test} busy={testing} disabled={!url.trim()} />
        {status ? <Notice tone={status.ok ? "success" : "error"} text={status.text} /> : null}
      </Card>

      <Card>
        <Title>{t.theme}</Title>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {themes.map(([id, label]) => (
            <Button key={id} label={label} variant={s.theme === id ? "primary" : "outline"} onPress={() => set({ theme: id })} style={{ flex: 1 }} />
          ))}
        </View>
      </Card>

      <Card>
        <Title>{t.language}</Title>
        <View style={{ gap: 8 }}>
          {LANGS.map((lang) => (
            <Button key={lang.id} label={lang.label} variant={s.lang === lang.id ? "primary" : "outline"} onPress={() => set({ lang: lang.id })} />
          ))}
        </View>
      </Card>
    </Screen>
  );
}
