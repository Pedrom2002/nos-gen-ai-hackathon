import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { analyzeDocument, deleteDocument } from "@/services/anonymizer";
import { anonymize, normalizeCategory, type Entity } from "@/lib/anonymizer";

export default defineTool({
  name: "anonymize_text",
  title: "Anonymize text",
  description:
    "Detect GDPR personal and special-category data in a (Portuguese) document and return the masked text plus the detected entities.",
  inputSchema: { text: z.string().min(1).max(200_000).describe("Full document text to anonymize.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ text }) => {
    const result = await analyzeDocument(text);
    // The tool is stateless: the backend copy is dropped as soon as it is used.
    if (result.docId) void deleteDocument(result.docId).catch(() => {});
    const entities: Entity[] = result.entities.map((e, i) => ({
      id: String(i),
      text: e.text,
      category: normalizeCategory(e.category),
      reason: e.reason,
      gdpr_basis: e.gdpr_basis ?? "",
      enabled: true,
    }));
    const masked = anonymize(result.text, entities);
    return {
      content: [{ type: "text", text: masked }],
      structuredContent: {
        anonymized_text: masked,
        summary: result.summary,
        entities: entities.map((e) => ({ text: e.text, category: e.category, reason: e.reason, gdpr_basis: e.gdpr_basis })),
      },
    };
  },
});
