// Hand the results to the phone's share sheet (save to files, mail, chat...).
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/** Writes the text to the cache as `name` (ending in a newline) and shares it. */
export async function shareText(name: string, content: string, mimeType = "text/plain"): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.write(content.endsWith("\n") ? content : `${content}\n`);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

export async function shareFile(uri: string, mimeType: string): Promise<void> {
  await Sharing.shareAsync(uri, { mimeType });
}
