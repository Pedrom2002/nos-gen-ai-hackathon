import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionProvider } from "@/session";
import { SettingsProvider, useSettings } from "@/settings";
import { DemoBadge, useColors } from "@/ui";
import { useApi } from "@/useApi";

function HeaderRight() {
  const { t, u } = useSettings();
  const api = useApi();
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {api.demo && <DemoBadge label={u.demoMode} />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.settings}
        hitSlop={12}
        onPress={() => router.push("/settings")}
        style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }}
      >
        <Text style={{ color: c.primary, fontSize: 16, fontWeight: "600" }}>{t.settings}</Text>
      </Pressable>
    </View>
  );
}

function Navigator() {
  const c = useColors();
  const { t } = useSettings();
  return (
    <>
      <StatusBar style={c.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.card },
          headerTintColor: c.foreground,
          contentStyle: { backgroundColor: c.background },
          headerRight: () => <HeaderRight />,
        }}
      >
        <Stack.Screen name="index" options={{ title: "Lethe" }} />
        <Stack.Screen name="review" options={{ title: t.steps[1] }} />
        <Stack.Screen name="result" options={{ title: t.steps[2] }} />
        <Stack.Screen name="settings" options={{ title: t.settings, headerRight: () => null }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <SessionProvider>
          <Navigator />
        </SessionProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
