export type ImageRef = { src: string; alt: string };

const placeholder = /\[Image(?: #\d+)?:\s*source:\s*([^\]\n]+?)\s*\]/g;
const markdown = /!\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const imageExt = /\.(png|jpe?g|gif|webp)$/i;

/** Whether a reference may be shown: http(s) URLs, or absolute/file:// paths to image files. */
export function displayableImage(src: string) {
  if (/^https?:\/\//i.test(src)) return true;
  const path = localImagePath(src);
  return path !== null && imageExt.test(path);
}

/**
 * Pulls images out of session text: provider placeholders for pasted images
 * ("[Image: source: /path.png]") and markdown images ("![alt](src)"). Returns
 * the text without them, plus the references in order (deduplicated).
 */
export function extractImages(text: string): { text: string; images: ImageRef[] } {
  const images: ImageRef[] = [];
  const seen = new Set<string>();
  const add = (src: string, alt: string) => {
    const clean = src.trim();
    if (!displayableImage(clean) || seen.has(clean)) return;
    seen.add(clean);
    images.push({ src: clean, alt });
  };
  let rest = text.replace(placeholder, (_m, src: string) => {
    add(src, "Image");
    return "";
  });
  rest = rest.replace(markdown, (whole, alt: string, src: string) => {
    if (!displayableImage(src.trim())) return whole;
    add(src, alt || "Image");
    return "";
  });
  return { text: rest.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), images };
}

/** Decode local file URLs without importing Node into the client bundle. */
export function localImagePath(src: string) {
  if (/^file:/i.test(src)) {
    if (!/^file:\/\//i.test(src)) return null;
    try {
      const url = new URL(src);
      if (url.protocol !== "file:" || url.search || url.hash || /%(?:2f|5c)/i.test(url.pathname)) return null;
      let path = decodeURIComponent(url.pathname);
      if (url.hostname && url.hostname !== "localhost") path = `//${url.hostname}${path}`;
      else if (/^\/[a-z]:\//i.test(path)) path = path.slice(1);
      return path.includes("\0") ? null : path;
    } catch { return null; }
  }
  if (src.includes("\0") || /^\\\\[.?]\\/.test(src)) return null;
  return src.startsWith("/") || /^[a-z]:[/\\]/i.test(src) || /^\\\\[^\\]+\\[^\\]+\\/.test(src) ? src : null;
}
