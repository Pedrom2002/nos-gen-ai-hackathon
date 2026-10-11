// The three steps of the web (Documento, Validação, Resultado): numbered
// circles, a ring on the current one, a check on the ones done.
import Feather from "@expo/vector-icons/Feather";
import { Fragment } from "react";
import { Text, View } from "react-native";

import { useSettings } from "@/settings";
import { useColors } from "@/ui";

export function Stepper({ step }: { step: 0 | 1 | 2 }) {
  const { t } = useSettings();
  const c = useColors();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`${step + 1} / ${t.steps.length}: ${t.steps[step]}`}
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}
    >
      {t.steps.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <Fragment key={label}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
                backgroundColor: done ? c.primary : c.card,
                borderWidth: current ? 2 : 1, borderColor: current || done ? c.primary : c.border,
              }}>
                {done
                  ? <Feather name="check" size={18} color={c.primaryForeground} />
                  : <Text style={{ color: current ? c.primary : c.mutedForeground, fontWeight: "700" }}>{i + 1}</Text>}
              </View>
              {current ? <Text style={{ color: c.foreground, fontWeight: "700", fontSize: 15 }}>{label}</Text> : null}
            </View>
            {i < t.steps.length - 1 ? (
              <View style={{ flex: 1, height: 2, marginHorizontal: 8, backgroundColor: done ? c.primary : c.border }} />
            ) : null}
          </Fragment>
        );
      })}
    </View>
  );
}
