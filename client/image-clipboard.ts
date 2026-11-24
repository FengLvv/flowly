// The SDK clipboard helper takes text. These web APIs copy pixels on the client
// device without creating a DOM element or transferring data back to the daemon.
type Bitmap = { width: number; height: number; close(): void };
const browser = globalThis as unknown as {
  navigator?: { clipboard?: { write(items: unknown[]): Promise<void> } };
  ClipboardItem?: new (items: Record<string, Promise<Blob>>) => unknown;
  createImageBitmap?: (blob: Blob) => Promise<Bitmap>;
  OffscreenCanvas?: new (width: number, height: number) => {
    getContext(kind: "2d"): { drawImage(bitmap: Bitmap, x: number, y: number): void } | null;
    convertToBlob(options: { type: string }): Promise<Blob>;
  };
};

async function asPng(uri: string): Promise<Blob> {
  const source = await (await fetch(uri)).blob();
  if (source.type === "image/png") return source;
  if (!browser.createImageBitmap || !browser.OffscreenCanvas) throw new Error("Image conversion is unavailable");
  const bitmap = await browser.createImageBitmap(source);
  try {
    const canvas = new browser.OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image conversion is unavailable");
    context.drawImage(bitmap, 0, 0);
    return await canvas.convertToBlob({ type: "image/png" });
  } finally {
    bitmap.close();
  }
}

export async function copyImage(uri: string): Promise<void> {
  const clipboard = browser.navigator?.clipboard;
  if (!clipboard?.write || !browser.ClipboardItem) throw new Error("Image clipboard is unavailable");
  const png = asPng(uri);
  // A rejected write may leave the encoder running with no consumer.
  void png.catch(() => {});
  // Request the write within the user gesture, including on browsers that
  // expire transient activation before asynchronous image decoding finishes.
  await clipboard.write([new browser.ClipboardItem({ "image/png": png })]);
}
