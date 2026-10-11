// The web's entity drawer: values grouped by category, a check box per
// category to mask or show them all, and one button per value.
import Feather from "@expo/vector-icons/Feather";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CATEGORIES, type CategoryId, type Entity } from "@web/lib/anonymizer";

import { useSettings } from "@/settings";
import { CATEGORY_COLORS, useColors } from "@/ui";

export function EntitySheet({ open, onClose, entities, onToggle, onToggleCategory }: {
  open: boolean;
  onClose: () => void;
  entities: Entity[];
  onToggle: (id: string) => void;
  onToggleCategory: (category: CategoryId, on: boolean) => void;
}) {
  const { t, u, x } = useSettings();
  const c = useColors();
  const groups = CATEGORIES
    .map((cat) => ({ cat, items: entities.filter((e) => e.category === cat.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable accessibilityLabel={x.cancel} onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} />
      <SafeAreaView edges={["bottom"]} style={{ maxHeight: "80%", backgroundColor: c.card, borderTopLeftRadius: 18, borderTopRightRadius: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Text accessibilityRole="header" style={{ flex: 1, color: c.foreground, fontSize: 18, fontWeight: "700" }}>
            {`${t.entities} (${entities.length})`}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={u.close} onPress={onClose} hitSlop={10}
            style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
            <Feather name="x" size={22} color={c.mutedForeground} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
          {groups.map(({ cat, items }) => {
            const on = items.filter((e) => e.enabled).length;
            const icon = on === items.length ? "check-square" : on === 0 ? "square" : "minus-square";
            return (
              <View key={cat.id} style={{ gap: 8 }}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on === items.length ? true : on === 0 ? false : "mixed" }}
                  accessibilityLabel={`${x.cats[cat.id] ?? cat.label}: ${on}/${items.length}`}
                  onPress={() => onToggleCategory(cat.id, on !== items.length)}
                  style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 }}
                >
                  <Feather name={icon} size={20} color={CATEGORY_COLORS[cat.id]} />
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: CATEGORY_COLORS[cat.id] }} />
                  <Text style={{ flex: 1, color: c.foreground, fontWeight: "700" }}>{x.cats[cat.id] ?? cat.label}</Text>
                  <Text style={{ color: c.mutedForeground }}>{`${on}/${items.length}`}</Text>
                </Pressable>
                {items.map((e) => (
                  <Pressable
                    key={e.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: e.enabled }}
                    accessibilityLabel={`${x.cats[e.category] ?? e.category}: ${e.enabled ? u.enabled : u.disabled}, ${e.text}`}
                    onPress={() => onToggle(e.id)}
                    style={{
                      minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12,
                      paddingVertical: 8, justifyContent: "center", backgroundColor: e.enabled ? c.background : "transparent",
                    }}
                  >
                    <Text style={{
                      color: e.enabled ? c.foreground : c.mutedForeground, fontFamily: "monospace",
                      textDecorationLine: e.enabled ? "none" : "line-through",
                    }}>{e.text}</Text>
                    {e.reason ? <Text numberOfLines={2} style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }}>{e.manual ? x.manual : e.reason}</Text> : null}
                  </Pressable>
                ))}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
