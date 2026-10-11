// Result, as in the web: the steps, the original and the anonymised version
// side by side (one under the other on a phone) or with a handle to slide,
// the photo and its redacted copy for images, the download actions and the
// explanatory report with its counters, the bar by category and the table.
import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { CATEGORIES, stats } from "@web/lib/anonymizer";

import { MaskedText, Panel, Photo, Slider } from "@/components/Comparison";
import { Stepper } from "@/components/Stepper";
import { reportMarkdown, reportRows, type ReportLabels } from "@/report";
import { alignedMask } from "@/review";
import { useSession } from "@/session";
import { useSettings } from "@/settings";
import { shareFile, shareText } from "@/share";
import { Body, Button, CATEGORY_COLORS, Notice, Screen, useColors } from "@/ui";
import { useApi } from "@/useApi";

type Redacted = { uri: string; filename: string; mime: string };

/** Two or more choices in a pill, as the web's toggle groups. */
function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { id: T; label: string }[]; onChange: (id: T) => void;
}) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}
      style={{ flexDirection: "row", borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 3, backgroundColor: c.card }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(o.id)}
            style={{ flex: 1, minHeight: 38, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.primary : "transparent" }}>
            <Text style={{ color: on ? c.primaryForeground : c.foreground, fontWeight: "600", fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Stat({ name, value, color, bar }: { name: string; value: string; color: string; bar: string }) {
  const c = useColors();
  return (
    <View accessible accessibilityLabel={`${name}: ${value}`}
      style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 10, overflow: "hidden", backgroundColor: c.card }}>
      <View style={{ height: 3, backgroundColor: bar }} />
      <View style={{ padding: 10, gap: 4 }}>
        <Text numberOfLines={2} style={{ color: c.mutedForeground, fontSize: 10, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>{name}</Text>
        <Text style={{ color, fontSize: 22, fontWeight: "700" }}>{value}</Text>
      </View>
    </View>
  );
}

export default function ResultScreen() {
  const { t, u, x, m } = useSettings();
  const c = useColors();
  const api = useApi();
  const { result, source, history, output, prepared, reset } = useSession();
  const [view, setView] = useState<"document" | "text">("document");
  const [layout, setLayout] = useState<"side" | "slide">("slide");
  // Summary and redacted photo were fetched by Generate result, so the screen
  // opens complete instead of filling in piece by piece.
  const summary = prepared?.summary ?? result?.summary ?? "";
  const [redacted, setRedacted] = useState<Redacted | null>(prepared?.redacted ?? null);
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "error" | "success" } | null>(
    prepared?.error ? { text: prepared.error, tone: "error" } : null,
  );
  const [busy, setBusy] = useState(false);
  const docId = result?.docId;

  const rows = useMemo(() => (result ? reportRows(result.text, history.present) : []), [result, history.present]);
  const byCategory = useMemo(() => CATEGORIES
    .map((cat) => ({ id: cat.id, label: x.cats[cat.id] ?? cat.label, n: rows.filter((r) => r.category === cat.id).length }))
    .filter((g) => g.n > 0), [rows, x.cats]);

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

  // A photo with its redacted copy can be compared as pictures, like the
  // web's document view; anything else compares the text.
  const photo = source?.kind === "image" && source.file && redacted?.mime.startsWith("image/") ? source.file : null;
  const asPictures = photo !== null && view === "document";
  const original = asPictures ? <Photo uri={photo.uri} label={t.original} /> : <Text selectable style={{ color: c.foreground, fontFamily: "monospace", fontSize: 13, lineHeight: 22 }}>{result.text}</Text>;
  const anonymised = asPictures && redacted ? <Photo uri={redacted.uri} label={u.redactedPreview} /> : <MaskedText text={output} />;
  const total = rows.length || 1;
  // In the slider, each masked word keeps its width so both layers line up.
  const sliding = asPictures ? anonymised : <MaskedText text={alignedMask(result.text, history.present)} />;

  return (
    <Screen>
      <Stepper step={2} />
      {summary ? <Body muted>{summary}</Body> : null}
      {result.unread ? <Notice tone="warning" text={u.unreadLines.replace("{n}", String(result.unread))} /> : null}

      {photo ? (
        <Segmented label={u.docView} value={view} onChange={setView}
          options={[{ id: "document", label: u.viewDocument }, { id: "text", label: u.viewText }]} />
      ) : null}
      <Segmented label={u.comparison} value={layout} onChange={setLayout}
        options={[{ id: "side", label: u.sideBySide }, { id: "slide", label: u.slideView }]} />

      {layout === "side" ? (
        <>
          <Panel title={t.original}>{original}</Panel>
          <Panel title={t.anonymized}>{anonymised}</Panel>
        </>
      ) : (
        <Slider label={u.comparison} under={original} over={sliding} />
      )}

      {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}

      <View style={{ gap: 10 }}>
        <Button variant="primary" icon="download" label={t.downloadTxt} disabled={busy} onPress={() => act(() => shareText("submission.txt", output))} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button icon="arrow-left" label={t.review} disabled={busy} onPress={() => router.back()} style={{ flex: 1 }} />
          <Button icon="copy" label={t.copy} disabled={busy} style={{ flex: 1 }} onPress={() => act(async () => {
            await Clipboard.setStringAsync(output);
            setNotice({ text: t.copied, tone: "success" });
          })} />
        </View>
        <Button icon="file-text" label={t.downloadReport} disabled={busy} onPress={shareReport} />
        {result.redactable && !api.demo ? (
          <Button icon="shield" label={u.downloadRedacted} disabled={busy} busy={busy} onPress={shareRedacted} />
        ) : null}
      </View>

      <View style={{ gap: 14, marginTop: 8 }}>
        <Text accessibilityRole="header" style={{ color: c.foreground, fontSize: 20, fontWeight: "700" }}>{t.reportTitle}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Stat name={t.entities} value={String(st.count)} color={c.foreground} bar={c.primary} />
          <Stat name={t.pctWords} value={`${st.pct}%`} color={c.foreground} bar={c.primary} />
          <Stat name={t.risk} value={x.risk[st.risk] ?? st.risk} color={riskColor} bar={riskColor} />
        </View>

        {byCategory.length ? (
          <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.card, padding: 14, gap: 12 }}>
            <Text style={{ color: c.mutedForeground, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>{u.byCategory}</Text>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              style={{ flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: c.muted }}>
              {byCategory.map((g) => <View key={g.id} style={{ flex: g.n / total, backgroundColor: CATEGORY_COLORS[g.id] }} />)}
            </View>
            {byCategory.map((g) => (
              <View key={g.id} accessible accessibilityLabel={`${g.label}: ${g.n}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: CATEGORY_COLORS[g.id] }} />
                <Text style={{ flex: 1, color: c.foreground }}>{g.label}</Text>
                <Text style={{ color: c.mutedForeground, fontWeight: "600" }}>{g.n}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.card, overflow: "hidden" }}>
          {rows.length === 0 ? <View style={{ padding: 14 }}><Body muted>{x.noEntities}</Body></View> : rows.map((r, i) => (
            <View key={r.value} accessible accessibilityLabel={`${r.value}, ${x.cats[r.category] ?? r.category}, ${r.manual ? x.manual : r.reason}`}
              style={{ padding: 12, gap: 6, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Text style={{
                  color: c.foreground, fontFamily: "monospace", fontSize: 13, paddingHorizontal: 6, paddingVertical: 2,
                  borderRadius: 4, backgroundColor: `${CATEGORY_COLORS[r.category]}26`,
                }}>{r.value}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CATEGORY_COLORS[r.category] }} />
                  <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{x.cats[r.category] ?? r.category}</Text>
                </View>
              </View>
              <Text style={{ color: c.mutedForeground, fontSize: 13 }}>{r.manual ? x.manual : r.reason}</Text>
            </View>
          ))}
        </View>
      </View>

      <Button variant="ghost" icon="plus" label={m.newDocument} disabled={busy} onPress={startOver} />
    </Screen>
  );
}
