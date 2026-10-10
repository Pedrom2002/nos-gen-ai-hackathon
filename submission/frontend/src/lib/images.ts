// Decodes a photo or scan into a canvas no bigger than `maxSide`, with the
// EXIF orientation applied, so the OCR boxes match what the page shows.
export async function loadImagePage(file: Blob, maxSide = 2500): Promise<HTMLCanvasElement> {
  const probe = await createImageBitmap(file, { imageOrientation: "from-image" });
  const ratio = Math.min(1, maxSide / Math.max(probe.width, probe.height));
  const bitmap = ratio < 1
    ? await createImageBitmap(file, { imageOrientation: "from-image", resizeWidth: Math.round(probe.width * ratio), resizeHeight: Math.round(probe.height * ratio), resizeQuality: "high" })
    : probe;
  if (bitmap !== probe) probe.close();
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);  // transparent PNGs read better on white
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}
