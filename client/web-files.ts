import { Platform } from "react-native";
import { imageMimeTypes } from "../shared/composer";
import { t } from "../shared/i18n";

export type BrowserFile = { name: string; type: string; size: number };
export type ComposerAttachment = { id: string; kind: "image" | "file"; name: string; mimeType: string; data: string; uri: string; unavailable?: boolean };
type Transfer = { files?: ArrayLike<BrowserFile>; items?: ArrayLike<{ kind: string; getAsFile(): BrowserFile | null }> };
type Event = { preventDefault(): void; stopPropagation?(): void; clipboardData?: Transfer; dataTransfer?: Transfer & { dropEffect?: string } };
type Node = { addEventListener(name: string, listener: (event: Event) => void): void; removeEventListener(name: string, listener: (event: Event) => void): void };
const browser = globalThis as unknown as {
  document?: { createElement(tag: "input"): { type: string; accept: string; multiple: boolean; files: ArrayLike<BrowserFile> | null; onchange: (() => void) | null; oncancel: (() => void) | null; click(): void } };
  FileReader?: new () => { result: unknown; onload: (() => void) | null; onerror: (() => void) | null; onabort: (() => void) | null; readAsDataURL(file: BrowserFile): void };
};
export const fileInputSupported = Platform.OS === "web" && !!browser.document && !!browser.FileReader;
let sequence = 0;
const mime = (file: BrowserFile) => file.type || ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", txt: "text/plain", md: "text/markdown", pdf: "application/pdf" } as Record<string, string>)[file.name.split(".").pop()?.toLowerCase() || ""] || "application/octet-stream";
export async function readFiles(files: readonly BrowserFile[]) {
  const attachments: ComposerAttachment[] = [], problems: string[] = [];
  for (const file of files) {
    try {
      const uri = await new Promise<string>((resolve, reject) => {
        if (!browser.FileReader) return reject(new Error(t("File input is unavailable.")));
        const reader = new browser.FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reader.onabort = () => reject(new Error(t("Could not read {name}.", { name: file.name })));
        reader.readAsDataURL(file);
      });
      const comma = uri.indexOf(",");
      if (comma < 0) throw new Error(t("Could not read {name}.", { name: file.name }));
      const mimeType = mime(file), image = (imageMimeTypes as readonly string[]).includes(mimeType);
      attachments.push({ id: `attachment-${Date.now()}-${++sequence}`, kind: image ? "image" : "file", name: file.name || t("File"), mimeType, data: uri.slice(comma + 1), uri: image ? uri : "" });
    } catch (error) { problems.push(error instanceof Error ? error.message : String(error)); }
  }
  return { attachments, problems };
}
export function pickFiles(imagesOnly = false): Promise<BrowserFile[]> {
  return new Promise(resolve => {
    if (!fileInputSupported) return resolve([]);
    const input = browser.document!.createElement("input");
    input.type = "file"; input.accept = imagesOnly ? imageMimeTypes.join(",") : ""; input.multiple = true;
    input.onchange = () => resolve(Array.from(input.files || [])); input.oncancel = () => resolve([]); input.click();
  });
}
export function transferredFiles(transfer?: Transfer): BrowserFile[] {
  const items = Array.from(transfer?.items || []).filter(item => item.kind === "file").map(item => item.getAsFile()).filter((file): file is BrowserFile => !!file);
  return items.length ? items : Array.from(transfer?.files || []);
}
/** Composer-only web exception: text pastes remain untouched; all file MIME types share intake. */
export function listenForFiles(node: unknown, onFiles: (files: BrowserFile[]) => void) {
  const target = node as Partial<Node> | null;
  if (!fileInputSupported || typeof target?.addEventListener !== "function") return () => undefined;
  const paste = (event: Event) => { const files = transferredFiles(event.clipboardData); if (files.length) { event.preventDefault(); event.stopPropagation?.(); onFiles(files); } };
  const over = (event: Event) => { if (!transferredFiles(event.dataTransfer).length && !Array.from(event.dataTransfer?.items || []).some(item => item.kind === "file")) return; event.preventDefault(); event.stopPropagation?.(); if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"; };
  const drop = (event: Event) => { const files = transferredFiles(event.dataTransfer); if (files.length) { event.preventDefault(); event.stopPropagation?.(); onFiles(files); } };
  target.addEventListener("paste", paste); target.addEventListener("dragover", over); target.addEventListener("drop", drop);
  return () => { target.removeEventListener?.("paste", paste); target.removeEventListener?.("dragover", over); target.removeEventListener?.("drop", drop); };
}
