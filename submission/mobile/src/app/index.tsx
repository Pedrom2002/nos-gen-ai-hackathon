// Import, as in the web: the steps, a drop card with the document picture and
// the accepted formats, then camera, gallery and file pickers, the example and
// a collapsible box to paste text. While the API works, the river sweeps.
import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { SAMPLE } from "@web/lib/anonymizer";

import { RiverLoading } from "@/components/RiverLoading";
import { Stepper } from "@/components/Stepper";
import { checkPicked, pickFile, pickImage, sizeLabel, takePhoto, type PickOutcome } from "@/pick";
import { useSession } from "@/session";
import { useSettings } from "@/settings";
import { Button, Notice, Screen, useColors, type Colors } from "@/ui";
import { useApi } from "@/useApi";

const FORMATS = ["PDF", "DOCX", "TXT", "CSV", "PNG", "JPG", "WEBP"];

/** The web's drop picture: a tilted page with grey and highlighted lines. */
function DocumentPicture({ c }: { c: Colors }) {
  const bars: [number, boolean][] = [[0.6, false], [0.85, true], [0.45, false], [0.8, true], [0.55, false]];
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignItems: "center", paddingVertical: 8 }}>
      <View style={{
        width: 200, padding: 16, gap: 9, borderRadius: 10, borderWidth: 1, borderColor: c.border,
        backgroundColor: c.background, transform: [{ rotate: "-4deg" }],
      }}>
        {bars.map(([w, on], i) => (
          <View key={i} style={{ height: 7, borderRadius: 4, width: `${w * 100}%`, backgroundColor: on ? c.primary : c.muted }} />
        ))}
      </View>
      <View style={{
        position: "absolute", right: 50, bottom: -6, width: 40, height: 40, borderRadius: 20,
        backgroundColor: c.primary, alignItems: "center", justifyContent: "center",
      }}>
        <Feather name="upload" size={18} color={c.primaryForeground} />
      </View>
    </View>
  );
}

export default function ImportScreen() {
  const { t, u, x, m } = useSettings();
  const c = useColors();
  const api = useApi();
  const session = useSession();
  const source = session.source;
  const [text, setText] = useState("");
  const [paste, setPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const take = (outcome: PickOutcome) => {
    setError("");
    if (outcome === null) return; // cancelled: nothing changes
    if (outcome === "denied") { setError(m.permissionDenied); return; }
    const check = checkPicked(outcome);
    if (!check.ok) {
      setError(check.reason === "size"
        ? m.fileTooBig.replace("{name}", outcome.name).replace("{size}", sizeLabel(outcome.size ?? 0))
        : u.invalidFile);
      return;
    }
    setText("");
    session.setSource({ file: outcome, kind: check.kind, text: "" });
  };

  const applyText = (value: string) => {
    setText(value);
    setError("");
    session.setSource(value.trim() ? { kind: "text", text: value } : null);
  };

  const clear = () => { setText(""); setError(""); session.setSource(null); };

  const analyze = async () => {
    if (!source) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.analyze(source.file ? { file: source.file } : { text: source.text });
      session.setResult(result);
      router.push("/review");
    } catch (e) {
      setError(e instanceof Error ? e.message : x.unknownErr);
    } finally {
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <Screen>
        <Stepper step={0} />
        <RiverLoading text={source?.text ?? ""} />
      </Screen>
    );
  }

  const picked = source?.file;
  return (
    <Screen>
      <Stepper step={0} />

      {source ? (
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 14, backgroundColor: c.card, padding: 14, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Feather name={source.kind === "image" ? "image" : "file-text"} size={20} color={c.primary} />
            <Text numberOfLines={1} style={{ flex: 1, color: c.foreground, fontWeight: "600" }}>
              {picked?.name ?? u.pastedText}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={u.clearFile} hitSlop={10} onPress={clear}
              style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
              <Feather name="x" size={20} color={c.mutedForeground} />
            </Pressable>
          </View>
          {source.kind === "image" && picked ? (
            <Image source={{ uri: picked.uri }} accessibilityLabel={picked.name} contentFit="contain"
              style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: 8, backgroundColor: c.background }} />
          ) : source.text ? (
            <Text numberOfLines={8} style={{ color: c.mutedForeground, fontFamily: "monospace", fontSize: 12, lineHeight: 20 }}>
              {source.text}
            </Text>
          ) : null}
          <Button variant="primary" icon="shield" label={t.anonymize} onPress={analyze} />
        </View>
      ) : (
        <View style={{
          borderWidth: 1.5, borderStyle: "dashed", borderColor: c.border, borderRadius: 14, backgroundColor: c.card,
          paddingVertical: 24, paddingHorizontal: 16, alignItems: "center", gap: 16,
        }}>
          <DocumentPicture c={c} />
          <Text accessibilityRole="header" style={{ color: c.foreground, fontSize: 20, fontWeight: "700", textAlign: "center" }}>
            {u.dropTitle}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
            {FORMATS.map((f) => (
              <Text key={f} style={{
                color: c.mutedForeground, fontFamily: "monospace", fontSize: 11, letterSpacing: 1.5,
                borderWidth: 1, borderColor: c.border, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3,
              }}>{f}</Text>
            ))}
          </View>
          <View style={{ alignSelf: "stretch", gap: 10 }}>
            <Button variant="primary" icon="camera" label={m.takePhoto} onPress={async () => take(await takePhoto())} />
            <Button icon="upload" label={u.chooseFile} hint="PDF, DOCX, TXT, CSV" onPress={async () => take(await pickFile())} />
            <Button icon="image" label={m.pickImage} onPress={async () => take(await pickImage())} />
          </View>
        </View>
      )}

      {error ? <Notice tone="error" text={error} /> : null}

      {!picked ? (
        <View style={{ gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: paste }}
            onPress={() => setPaste((p) => !p)}
            style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <Feather name="clipboard" size={16} color={c.mutedForeground} />
            <Text style={{ color: c.mutedForeground, fontSize: 15 }}>{u.pasteText}</Text>
            <Feather name={paste ? "chevron-up" : "chevron-down"} size={16} color={c.mutedForeground} />
          </Pressable>
          {paste ? (
            <TextInput
              accessibilityLabel={u.pasteText}
              multiline
              autoFocus
              value={text}
              onChangeText={applyText}
              placeholder={t.placeholder}
              placeholderTextColor={c.mutedForeground}
              style={{
                minHeight: 160, color: c.foreground, fontSize: 14, fontFamily: "monospace", textAlignVertical: "top",
                borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, backgroundColor: c.card,
              }}
            />
          ) : null}
          <Button variant="ghost" icon="file-text" label={t.example} onPress={() => { setPaste(true); applyText(SAMPLE); }} />
        </View>
      ) : null}
    </Screen>
  );
}
