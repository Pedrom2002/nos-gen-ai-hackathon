import { defineMcp } from "@lovable.dev/mcp-js";
import anonymizeText from "./tools/anonymize-text";

export default defineMcp({
  name: "protector-pt",
  title: "Protector PT",
  version: "0.1.0",
  instructions:
    "Lethe anonymizes GDPR personal data in Portuguese documents. Send the document text to `anonymize_text` to get the masked version (each sensitive word replaced by `*`) and an explanation of what was found. Nothing is stored.",
  tools: [anonymizeText],
});
