// Result: the anonymised text next to the original, the summary from the API,
// and sharing of submission.txt, the report and the redacted file.
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { keepIds, useSession } from "@/session";
import { useSettings } from "@/settings";
import { shareFile, shareText } from "@/share";
import { Body, Button, Card, Notice, Screen, Title, useColors } from "@/ui";
import { useApi } from "@/useApi";

type Redacted = { uri: string; filename: string; mime: string };

export default function ResultScreen() {
  const { t, u, x, m } = useSettings();
  const c = useColors();
  const api = useApi();
  const { result, source, history, output, reset } = useSession();
  const [tab, setTab] = useState<"anonymized" | "original">("anonymized");
  const [summary, setSummary] = useState(result?.summary ?? "");
  const [redacted, setRedacted] = useState<Redacted | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "error" | "success" } | null>(null);
  const [busy, setBusy] = useState(false);
  const docId = result?.docId;

  // Tell the API what the reviewer kept visible, so its summary, leak check
  // and redacted file match this screen; then show a redacted photo back.
  useEffect(() => {
    if (!docId || api.demo) return;
    let alive = true;
    (async () => {
      try {
        const text = await api.decide(docId, keepIds(history.present));
        if (alive && text) setSummary(text);
        if (result?.redactable && source?.kind === "image") {
          const file = await api.redacted(docId);
          if (alive) setRedacted(file);
        }
      } catch (e) {
        if (alive) setNotice({ text: e instanceof Error ? e.message : x.unknownErr, tone: "error" });
      }
    })();
    return () => { alive = false; };
  }, [docId, api, history.present, result?.redactable, source?.kind, x.unknownErr]);

  if (!result) {
    return (
      <Screen>
        <Body>{x.emptyDoc}</Body>
        <Button variant="primary" label={u.home} onPress={() => router.replace("/")} />
      </Screen>
    );
  }

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await work();
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : x.unknownErr, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const shareRedacted = () => act(async () => {
    const file = redacted ?? (docId ? await api.redacted(docId) : null);
    if (!file) return;
    setRedacted(file);
    await shareFile(file.uri, file.mime);
  });

  const shareReport = () => act(async () => {
    const md = docId && !api.demo ? await api.report(docId) : `# ${t.reportTitle}\n\n${summary}\n`;
    await shareText("relatorio.md", md, "text/markdown");
  });

  const startOver = async () => {
    if (docId) await api.remove(docId).catch(() => {});
    reset();
    router.replace("/");
  };

  const shown = tab === "anonymized" ? output : result.text;
  return (
    <Screen>
      <Title>{t.reportTitle}</Title>
      {summary ? <Body muted>{summary}</Body> : null}
      {result.unread ? <Notice tone="warning" text={u.unreadLines.replace("{n}", String(result.unread))} /> : null}

      <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 8 }}>
        {(["anonymized", "original"] as const).map((id) => (
          <Button
            key={id}
            label={id === "anonymized" ? t.anonymized : t.original}
            variant={tab === id ? "primary" : "outline"}
            onPress={() => setTab(id)}
            style={{ flex: 1 }}
          />
        ))}
      </View>
      <Card>
        <Text selectable style={{ color: c.foreground, fontFamily: "monospace", fontSize: 14, lineHeight: 22 }}>
          {shown}
        </Text>
      </Card>

      {redacted && redacted.mime.startsWith("image/") ? (
        <Card>
          <Body muted>{u.redactedPreview}</Body>
          <Image source={{ uri: redacted.uri }} accessibilityLabel={u.redactedPreview} contentFit="contain"
            style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: 8 }} />
        </Card>
      ) : null}

      {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}

      <View style={{ gap: 10 }}>
        <Button label={t.copy} disabled={busy} onPress={() => act(async () => {
          await Clipboard.setStringAsync(output);
          setNotice({ text: t.copied, tone: "success" });
        })} />
        <Button variant="primary" label={m.shareTxt} disabled={busy} onPress={() => act(() => shareText("submission.txt", output))} />
        <Button label={m.shareReport} disabled={busy} onPress={shareReport} />
        {result.redactable && !api.demo ? (
          <Button label={m.shareRedacted} disabled={busy} busy={busy} onPress={shareRedacted} />
        ) : null}
        <Button variant="ghost" label={m.newDocument} disabled={busy} onPress={startOver} />
      </View>
    </Screen>
  );
}
