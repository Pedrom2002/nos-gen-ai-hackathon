// Result: the anonymised text next to the original, the summary from the API,
// and sharing of submission.txt, the report and the redacted file.
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { stats } from "@web/lib/anonymizer";

import { reportMarkdown, reportRows, type ReportLabels } from "@/report";
import { keepIds, useSession } from "@/session";
import { useSettings } from "@/settings";
import { shareFile, shareText } from "@/share";
import { Body, Button, CATEGORY_COLORS, Card, Notice, Screen, Title, useColors } from "@/ui";
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

  const st = stats(result.text, history.present);
  const rows = reportRows(result.text, history.present);
  const labels: ReportLabels = {
    entities: t.entities, pctWords: t.pctWords, risk: t.risk, thEntity: x.thEntity, thCategory: x.thCategory,
    thReason: x.thReason, noEntities: x.noEntities, manual: x.manual, cats: x.cats, riskNames: x.risk,
  };
  const riskColors: Record<string, string> = { Alto: c.destructive, "Médio": c.warning, Baixo: c.success, Nenhum: c.mutedForeground };
  const riskColor = riskColors[st.risk] ?? c.foreground;

  // The API report hides the values (safe to send); in demo mode the report
  // is built here from the same review.
  const shareReport = () => act(async () => {
    const md = docId && !api.demo
      ? await api.report(docId)
      : reportMarkdown(t.reportTitle, summary, rows, st, labels);
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
      <Title>{t.anonymized}</Title>
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

      <Card>
        <Title>{t.reportTitle}</Title>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {([[t.entities, String(st.count), c.foreground], [t.pctWords, `${st.pct}%`, c.foreground], [t.risk, x.risk[st.risk] ?? st.risk, riskColor]] as const).map(([name, value, color]) => (
            <View key={name} accessible accessibilityLabel={`${name}: ${value}`}
              style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 10 }}>
              <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{name}</Text>
              <Text style={{ color, fontSize: 20, fontWeight: "700" }}>{value}</Text>
            </View>
          ))}
        </View>
        {rows.length === 0 ? <Body muted>{x.noEntities}</Body> : rows.map((r) => (
          <View key={r.value} accessible accessibilityLabel={`${r.value}, ${x.cats[r.category] ?? r.category}, ${r.reason}`}
            style={{ borderLeftWidth: 4, borderLeftColor: CATEGORY_COLORS[r.category], paddingLeft: 10, gap: 2 }}>
            <Text style={{ color: c.foreground, fontWeight: "600" }}>{r.value}</Text>
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>{`${x.cats[r.category] ?? r.category}: ${r.manual ? x.manual : r.reason}`}</Text>
          </View>
        ))}
      </Card>

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
