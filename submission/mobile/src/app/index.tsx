// Import: take a photo, choose an image or a file, paste text or use the
// example; then send it to the API (the file itself, read by the server).
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";

import { SAMPLE } from "@web/lib/anonymizer";

import { checkPicked, pickFile, pickImage, sizeLabel, takePhoto, type PickOutcome } from "@/pick";
import { useSession } from "@/session";
import { useSettings } from "@/settings";
import { Body, Button, Card, Notice, Screen, Title, useColors } from "@/ui";
import { useApi } from "@/useApi";

export default function ImportScreen() {
  const { t, u, x, m } = useSettings();
  const c = useColors();
  const api = useApi();
  const session = useSession();
  const source = session.source;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  // The API answers in one request: walk through the steps while it works.
  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, m.analyzingSteps.length - 1)), 1400);
    return () => clearInterval(timer);
  }, [busy, m.analyzingSteps.length]);

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

  const picked = source?.file;
  return (
    <Screen>
      <Title>{u.dropTitle}</Title>
      <Body muted>{t.heroSub}</Body>

      <View style={{ gap: 10 }}>
        <Button variant="primary" label={m.takePhoto} onPress={async () => take(await takePhoto())} disabled={busy} />
        <Button label={m.pickImage} onPress={async () => take(await pickImage())} disabled={busy} />
        <Button label={u.chooseFile} hint="PDF, DOCX, TXT, CSV" onPress={async () => take(await pickFile())} disabled={busy} />
        <Button label={t.example} onPress={() => applyText(SAMPLE)} disabled={busy} />
      </View>

      <Card>
        <Body muted>{u.pasteText}</Body>
        <TextInput
          accessibilityLabel={u.pasteText}
          multiline
          value={text}
          onChangeText={applyText}
          placeholder={t.placeholder}
          placeholderTextColor={c.mutedForeground}
          editable={!busy}
          style={{ minHeight: 120, color: c.foreground, fontSize: 15, textAlignVertical: "top" }}
        />
      </Card>

      {picked && (
        <Card>
          <Body>{picked.name}</Body>
          {source?.kind === "image" && (
            <Image
              source={{ uri: picked.uri }}
              accessibilityLabel={picked.name}
              contentFit="contain"
              style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: 8 }}
            />
          )}
        </Card>
      )}

      {error ? <Notice tone="error" text={error} /> : null}

      {busy ? (
        <Card>
          <Body>{t.analyzing}</Body>
          {m.analyzingSteps.map((label, i) => (
            <Body key={label} muted={i > step}>{`${i < step ? "✓" : i === step ? "…" : "·"} ${label}`}</Body>
          ))}
        </Card>
      ) : null}

      <Button variant="primary" label={t.anonymize} onPress={analyze} disabled={!source} busy={busy} />
    </Screen>
  );
}
