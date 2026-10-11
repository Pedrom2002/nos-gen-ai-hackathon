// Review, as in the web: the person decides, the model only proposes. Values
// are marked in the document by category (tap to mask or show), category
// chips filter what stands out, the entity sheet toggles values and whole
// categories, undo/redo are always at hand. Any other words can be marked by
// hand, as the web's text selection: in marking mode, tap the first and the
// last word (a long-press marks one word straight away); the category is then
// picked in a sheet, always in reach. Back and
// Generate result stay fixed at the bottom; Generate waits for the API, as the
// web does, so the result opens whole instead of filling in piece by piece.
import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CATEGORIES, type CategoryId, type Entity } from "@web/lib/anonymizer";

import { EntitySheet } from "@/components/EntitySheet";
import { Stepper } from "@/components/Stepper";
import { addManual, categoryCounts, lineSegments, setCategory, toggle } from "@/review";
import { keepIds, useSession } from "@/session";
import { useSettings } from "@/settings";
import { Body, Button, CATEGORY_COLORS, Notice, Screen, useColors } from "@/ui";
import { useApi } from "@/useApi";

function IconButton({ icon, label, onPress, disabled = false, selected }: {
  icon: "rotate-ccw" | "rotate-cw" | "edit-3"; label: string; onPress: () => void; disabled?: boolean; selected?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled}
      onPress={onPress} style={{
        width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1,
        backgroundColor: selected ? c.primary : "transparent",
      }}>
      <Feather name={icon} size={20} color={selected ? c.primaryForeground : c.foreground} />
    </Pressable>
  );
}

export default function ReviewScreen() {
  const { t, u, x, m } = useSettings();
  const c = useColors();
  const api = useApi();
  const { result, source, history, dispatch, setPrepared } = useSession();
  const entities = history.present;
  const [filters, setFilters] = useState<CategoryId[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [notice, setNotice] = useState("");
  const [generating, setGenerating] = useState(false);
  const [marking, setMarking] = useState(false);
  // The words picked in marking mode, as positions in the text.
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);

  const lines = useMemo(() => (result ? lineSegments(result.text, entities) : []), [result, entities]);
  const counts = useMemo(() => categoryCounts(entities), [entities]);
  // Where each line starts in the text, to know where a tapped word is.
  const lineStarts = useMemo(() => {
    let at = 0;
    return (result?.text ?? "").split("\n").map((line) => { const start = at; at += line.length + 1; return start; });
  }, [result]);

  if (!result) {
    return (
      <Screen>
        <Body>{x.emptyDoc}</Body>
        <Button variant="primary" label={u.home} onPress={() => router.replace("/")} />
      </Screen>
    );
  }

  const commit = (next: Entity[]) => dispatch({ type: "commit", entities: next });
  const markManual = (category: CategoryId) => {
    if (!pending) return;
    const next = addManual(entities, pending, category, x.manual);
    setNotice(next ? "" : x.exists);
    if (next) commit(next);
    setPending(null);
  };
  // Tell the API what stays visible and fetch a photo's redacted copy first,
  // then open the result with everything in place.
  const generate = async () => {
    setGenerating(true);
    const prepared = { summary: result.summary ?? "", redacted: null as Awaited<ReturnType<typeof api.redacted>> | null, error: "" };
    if (result.docId && !api.demo) {
      try {
        const text = await api.decide(result.docId, keepIds(entities));
        if (text) prepared.summary = text;
        if (result.redactable && source?.kind === "image") prepared.redacted = await api.redacted(result.docId);
      } catch (e) {
        prepared.error = e instanceof Error ? e.message : x.unknownErr;
      }
    }
    setPrepared(prepared);
    setGenerating(false);
    router.push("/result");
  };
  // First tap starts a selection, the next ones stretch it (within one line);
  // tapping the only word picked clears it.
  const pickWord = (start: number, end: number) => {
    setRange((old) => {
      if (!old || result.text.slice(Math.min(old.start, start), Math.max(old.end, end)).includes("\n")) return { start, end };
      if (old.start === start && old.end === end) return null;
      return { start: Math.min(old.start, start), end: Math.max(old.end, end) };
    });
  };
  const picked = range ? result.text.slice(range.start, range.end) : "";
  const stopMarking = () => { setMarking(false); setRange(null); };
  const dimmed = (e: Entity) => filters.length > 0 && !filters.includes(e.category);

  const footer = marking ? (
    <>
      <Text numberOfLines={2} style={{ color: picked ? c.foreground : c.mutedForeground, fontFamily: picked ? "monospace" : undefined, textAlign: "center" }}>
        {picked ? `«${picked}»` : m.markHint}
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button icon="check" label={u.close} onPress={stopMarking} style={{ flex: 1 }} />
        <Button variant="primary" icon="edit-3" label={u.markSensitive} disabled={!picked}
          onPress={() => { setPending(picked); setRange(null); }} style={{ flex: 2 }} />
      </View>
    </>
  ) : (
    <>
      <Pressable accessibilityRole="button" onPress={() => setSheet(true)}
        style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Feather name="list" size={18} color={c.foreground} />
        <Text style={{ color: c.foreground, fontWeight: "600" }}>{`${t.entities} (${entities.length})`}</Text>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button icon="arrow-left" label={t.back} disabled={generating} onPress={() => router.back()} style={{ flex: 1 }} />
        <Button variant="primary" label={`${t.generate}  →`} busy={generating} onPress={generate} style={{ flex: 2 }} />
      </View>
    </>
  );

  return (
    <Screen footer={footer}>
      <Stepper step={1} />
      {notice ? <Notice tone="warning" text={notice} /> : null}

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <IconButton icon="rotate-ccw" label={u.undo} onPress={() => dispatch({ type: "undo" })} disabled={!history.past.length} />
        <IconButton icon="rotate-cw" label={u.redo} onPress={() => dispatch({ type: "redo" })} disabled={!history.future.length} />
        <IconButton icon="edit-3" label={u.markSensitive} selected={marking} onPress={() => (marking ? stopMarking() : setMarking(true))} />
        <Text style={{ flex: 1, textAlign: "right", color: c.mutedForeground, fontSize: 12 }} numberOfLines={3}>{marking ? m.markHint : m.longPressHint}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={u.categoryFilter}
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {counts.map((cat) => {
          const on = filters.includes(cat.id);
          return (
            <Pressable
              key={cat.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${x.cats[cat.id] ?? cat.id}, ${cat.total}`}
              onPress={() => setFilters((old) => (on ? old.filter((id) => id !== cat.id) : [...old, cat.id]))}
              style={{
                minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: 10,
                borderWidth: 1, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.muted : c.card,
              }}
            >
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: CATEGORY_COLORS[cat.id] }} />
              <Text style={{ color: c.foreground, fontWeight: "600", fontSize: 13 }}>{x.cats[cat.id] ?? cat.id}</Text>
              <Text style={{ color: c.mutedForeground, fontSize: 13 }}>{cat.total}</Text>
            </Pressable>
          );
        })}
        {filters.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel={x.cancel} onPress={() => setFilters([])}
            style={{ minHeight: 40, minWidth: 40, alignItems: "center", justifyContent: "center" }}>
            <Feather name="x" size={18} color={c.mutedForeground} />
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.card, padding: 14 }}>
        {lines.map((segments, i) => {
          let at = lineStarts[i] ?? 0;
          return (
          <Text key={i} style={{ color: c.foreground, fontSize: 14, lineHeight: 24, fontFamily: "monospace" }}>
            {segments.length === 0 ? " " : segments.map((s, j) => {
              const e = s.entity;
              const segmentStart = at;
              at += s.text.length;
              if (e) {
                const color = CATEGORY_COLORS[e.category];
                return (
                  <Text
                    key={j}
                    accessibilityRole="button"
                    accessibilityLabel={`${x.cats[e.category] ?? e.category}: ${e.enabled ? u.enabled : u.disabled}, ${e.text}`}
                    onPress={() => commit(toggle(entities, e.id))}
                    style={{
                      backgroundColor: e.enabled ? `${color}33` : "transparent",
                      color: e.enabled ? c.foreground : c.mutedForeground,
                      textDecorationLine: e.enabled ? "underline" : "line-through",
                      textDecorationColor: color,
                      opacity: dimmed(e) ? 0.35 : 1,
                    }}
                  >
                    {s.text}
                  </Text>
                );
              }
              // Plain text: in marking mode a tap picks a word; a long-press
              // marks one word at any time.
              let wordAt = segmentStart;
              return s.text.split(/(\s+)/).map((part, k) => {
                const start = wordAt;
                wordAt += part.length;
                const inRange = range !== null && start < range.end && start + part.length > range.start;
                if (inRange && !/\S/.test(part)) return <Text key={`${j}-${k}`} style={{ backgroundColor: `${c.primary}40` }}>{part}</Text>;
                if (!/\S/.test(part)) return part;
                return (
                  <Text key={`${j}-${k}`}
                    onPress={marking ? () => pickWord(start, start + part.length) : undefined}
                    onLongPress={() => setPending(part)}
                    style={inRange ? { backgroundColor: `${c.primary}40`, color: c.foreground } : marking ? { textDecorationLine: "underline", textDecorationStyle: "dotted", textDecorationColor: c.mutedForeground } : undefined}>
                    {part}
                  </Text>
                );
              });
            })}
          </Text>
          );
        })}
      </View>

      <Modal visible={pending !== null} animationType="slide" transparent onRequestClose={() => setPending(null)}>
        <Pressable accessibilityLabel={x.cancel} onPress={() => setPending(null)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} />
        <SafeAreaView edges={["bottom"]} style={{ backgroundColor: c.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, gap: 12 }}>
          <Text accessibilityRole="header" style={{ color: c.foreground, fontSize: 16, fontWeight: "700" }}>{m.pickCategory}</Text>
          <Text style={{ color: c.foreground, fontFamily: "monospace", fontSize: 15, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: c.muted }}>{pending}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {CATEGORIES.map((cat) => (
              <Pressable key={cat.id} accessibilityRole="button" onPress={() => markManual(cat.id)}
                style={{ minHeight: 44, flexGrow: 1, flexBasis: "45%", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: CATEGORY_COLORS[cat.id] }} />
                <Text style={{ flex: 1, color: c.foreground }} numberOfLines={1}>{x.cats[cat.id] ?? cat.label}</Text>
              </Pressable>
            ))}
          </View>
          <Button variant="ghost" label={x.cancel} onPress={() => setPending(null)} />
        </SafeAreaView>
      </Modal>

      <EntitySheet
        open={sheet}
        onClose={() => setSheet(false)}
        entities={entities}
        onToggle={(id) => commit(toggle(entities, id))}
        onToggleCategory={(cat, on) => commit(setCategory(entities, cat, on))}
      />
    </Screen>
  );
}
