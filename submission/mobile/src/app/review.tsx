// Review, as in the web: the person decides, the model only proposes. Values
// are marked in the document by category (tap to mask or show), category
// chips filter what stands out, the entity sheet toggles values and whole
// categories, undo/redo are always at hand, and a long-press masks any other
// word. Back and Generate result stay fixed at the bottom.
import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { CATEGORIES, type CategoryId, type Entity } from "@web/lib/anonymizer";

import { EntitySheet } from "@/components/EntitySheet";
import { Stepper } from "@/components/Stepper";
import { addManual, categoryCounts, lineSegments, setCategory, toggle } from "@/review";
import { useSession } from "@/session";
import { useSettings } from "@/settings";
import { Body, Button, CATEGORY_COLORS, Notice, Screen, useColors } from "@/ui";

function IconButton({ icon, label, onPress, disabled }: {
  icon: "rotate-ccw" | "rotate-cw"; label: string; onPress: () => void; disabled: boolean;
}) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}>
      <Feather name={icon} size={20} color={c.foreground} />
    </Pressable>
  );
}

export default function ReviewScreen() {
  const { t, u, x, m } = useSettings();
  const c = useColors();
  const { result, history, dispatch } = useSession();
  const entities = history.present;
  const [filters, setFilters] = useState<CategoryId[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [notice, setNotice] = useState("");

  const lines = useMemo(() => (result ? lineSegments(result.text, entities) : []), [result, entities]);
  const counts = useMemo(() => categoryCounts(entities), [entities]);

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
  const dimmed = (e: Entity) => filters.length > 0 && !filters.includes(e.category);

  const footer = (
    <>
      <Pressable accessibilityRole="button" onPress={() => setSheet(true)}
        style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Feather name="list" size={18} color={c.foreground} />
        <Text style={{ color: c.foreground, fontWeight: "600" }}>{`${t.entities} (${entities.length})`}</Text>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button icon="arrow-left" label={t.back} onPress={() => router.back()} style={{ flex: 1 }} />
        <Button variant="primary" label={`${t.generate}  →`} onPress={() => router.push("/result")} style={{ flex: 2 }} />
      </View>
    </>
  );

  return (
    <Screen footer={footer}>
      <Stepper step={1} />

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <IconButton icon="rotate-ccw" label={u.undo} onPress={() => dispatch({ type: "undo" })} disabled={!history.past.length} />
        <IconButton icon="rotate-cw" label={u.redo} onPress={() => dispatch({ type: "redo" })} disabled={!history.future.length} />
        <Text style={{ flex: 1, textAlign: "right", color: c.mutedForeground, fontSize: 12 }} numberOfLines={2}>{m.longPressHint}</Text>
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
        {lines.map((segments, i) => (
          <Text key={i} style={{ color: c.foreground, fontSize: 14, lineHeight: 24, fontFamily: "monospace" }}>
            {segments.length === 0 ? " " : segments.map((s, j) => {
              const e = s.entity;
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
              // Plain text: each word can be long-pressed to mask it.
              return s.text.split(/(\s+)/).map((part, k) => (
                /\S/.test(part)
                  ? <Text key={`${j}-${k}`} onLongPress={() => setPending(part)}>{part}</Text>
                  : part
              ));
            })}
          </Text>
        ))}
      </View>

      {pending ? (
        <View style={{ borderWidth: 1, borderColor: c.primary, borderRadius: 12, backgroundColor: c.card, padding: 14, gap: 10 }}>
          <Body>{`${m.pickCategory}: «${pending}»`}</Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {CATEGORIES.map((cat) => (
              <Pressable key={cat.id} accessibilityRole="button" onPress={() => markManual(cat.id)}
                style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: c.border }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: CATEGORY_COLORS[cat.id] }} />
                <Text style={{ color: c.foreground }}>{x.cats[cat.id] ?? cat.label}</Text>
              </Pressable>
            ))}
          </View>
          <Button variant="ghost" label={x.cancel} onPress={() => setPending(null)} />
        </View>
      ) : null}
      {notice ? <Notice tone="warning" text={notice} /> : null}

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
