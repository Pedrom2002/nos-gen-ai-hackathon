import { Text, View } from "react-native";
import { anonymize } from "@web/lib/anonymizer";

export default function Home() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>{anonymize("Nome: Ana Correia", [{ id: "1", text: "Ana Correia", category: "nome", reason: "", gdpr_basis: "", enabled: true }])}</Text>
    </View>
  );
}
