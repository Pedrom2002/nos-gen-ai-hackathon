// Review: the person decides, the model only proposes. Tap a value to mask or
// show it, filter and toggle whole categories, undo and redo, and long-press
// any other word to mask it by hand.
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { CATEGORIES, type CategoryId, type Entity } from "@web/lib/anonymizer";

import { addManual, categoryCounts, lineSegments, setCategory, toggle } from "@/review";
import { useSession } from "@/session";
import { useSettings } from "@/settings";
import { Body, Button, CATEGORY_COLORS, Card, Notice, Screen, Title, useColors } from "@/ui";

export default function ReviewScreen() {
  const { t, u, x, m } = useSettings();
  const c = useColors();
  const { result, history, dispatch } = useSession();
  const entities = history.present;
  const [filter, setFilter] = useState<CategoryId | null>(null);
  const [pending, setPending] = useState<string | null>(null);
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
  const label = (e: Entity) => `${x.cats[e.category] ?? e.category}, ${e.text}, ${e.enabled ? m.masked : m.kept}`;
  const markManual = (category: CategoryId) => {
    if (!pending) return;
    const next = addManual(entities, pending, category, x.manual);
    setNotice(next ? "" : x.exists);
    if (next) commit(next);
    setPending(null);
  };
  const listed = filter ? entities.filter((e) => e.category === filter) : entities;

  return (
    <Screen>
      <Title>{t.review}</Title>
      {result.summary ? <Body muted>{result.summary}</Body> : null}
      <Body muted>{m.longPressHint}</Body>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label={u.undo} onPress={() => dispatch({ type: "undo" })} disabled={!history.past.length} style={{ flex: 1 }} />
        <Button label={u.redo} onPress={() => dispatch({ type: "redo" })} disabled={!history.future.length} style={{ flex: 1 }} />
      </View>

      <Card>
        {lines.map((segments, i) => (
          <Text key={i} style={{ color: c.foreground, fontSize: 15, lineHeight: 24 }}>
            {segments.length === 0 ? " " : segments.map((s, j) => {
              const e = s.entity;
              if (e) {
                const color = CATEGORY_COLORS[e.category];
                return (
                  <Text
                    key={j}
                    accessibilityRole="button"
                    accessibilityLabel={label(e)}
                    onPress={() => commit(toggle(entities, e.id))}
                    style={{
                      backgroundColor: e.enabled ? color : "transparent",
                      color: e.enabled ? "#ffffff" : color,
                      textDecorationLine: e.enabled ? "none" : "line-through",
                      fontWeight: "600",
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
      </Card>

      {pending ? (
        <Card>
          <Body>{`${m.pickCategory}: «${pending}»`}</Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {CATEGORIES.map((cat) => (
              <Button key={cat.id} label={x.cats[cat.id] ?? cat.label} onPress={() => markManual(cat.id)} />
            ))}
          </View>
          <Button variant="ghost" label={x.cancel} onPress={() => setPending(null)} />
        </Card>
      ) : null}
      {notice ? <Notice tone="warning" text={notice} /> : null}

      <Body muted>{u.categoryFilter}</Body>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Button label={`${t.entities} (${entities.length})`} variant={filter === null ? "primary" : "outline"} onPress={() => setFilter(null)} />
        {counts.map((cat) => (
          <Button
            key={cat.id}
            label={`${x.cats[cat.id] ?? cat.id} ${cat.enabled}/${cat.total}`}
            variant={filter === cat.id ? "primary" : "outline"}
            onPress={() => setFilter(cat.id)}
          />
        ))}
      </ScrollView>
      {filter ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label={m.maskAll} onPress={() => commit(setCategory(entities, filter, true))} style={{ flex: 1 }} />
          <Button label={m.showAll} onPress={() => commit(setCategory(entities, filter, false))} style={{ flex: 1 }} />
        </View>
      ) : null}

      <Card>
        {listed.length === 0 ? <Body muted>{x.noEntities}</Body> : listed.map((e) => (
          <Button
            key={e.id}
            label={label(e)}
            hint={e.reason}
            variant={e.enabled ? "outline" : "ghost"}
            onPress={() => commit(toggle(entities, e.id))}
            style={{ justifyContent: "flex-start", borderLeftWidth: 4, borderLeftColor: CATEGORY_COLORS[e.category] }}
          />
        ))}
      </Card>

      <Button variant="primary" label={t.generate} onPress={() => router.push("/result")} />
    </Screen>
  );
}
