import { afterEach, expect, test, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
async function setup() {
  vi.stubGlobal("document", {});
  vi.stubGlobal("FileReader", class {
    result = ""; onload?: () => void; onerror?: () => void;
    readAsDataURL(file: { type: string; contents?: string; bad?: boolean }) {
      if (file.bad) { this.onerror?.(); return; }
      this.result = `data:${file.type};base64,${Buffer.from(file.contents || "").toString("base64")}`; this.onload?.();
    }
  });
  return import("./web-files");
}
test("mixed file intake retains bytes, missing MIME, empty files, and successful siblings on failure", async () => {
  const { readFiles } = await setup();
  const files = [{ name: "binary.bin", type: "", size: 3, contents: "a\0b" }, { name: "empty.txt", type: "text/plain", size: 0 }, { name: "image.png", type: "image/png", size: 1, contents: "x" }, { name: "bad.pdf", type: "application/pdf", size: 1, bad: true }];
  const result = await readFiles(files);
  expect(result.attachments.map(a => [a.name, a.kind])).toEqual([["binary.bin", "file"], ["empty.txt", "file"], ["image.png", "image"]]);
  expect(result.attachments[0].mimeType).toBe("application/octet-stream");
  expect(Buffer.from(result.attachments[0].data, "base64")).toEqual(Buffer.from("a\0b"));
  expect(result.attachments[1].data).toBe(""); expect(result.problems).toHaveLength(1);
});
test("paste and drop consume files once without leaking to the host; text paste is untouched and cleanup removes handlers", async () => {
  const { listenForFiles } = await setup();
  const listeners = new Map<string, (event: any) => void>(), delivered = vi.fn();
  const cleanup = listenForFiles({ addEventListener: (name: string, fn: any) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) }, delivered);
  const file = { name: "report.pdf", type: "application/pdf", size: 2 };
  for (const name of ["paste", "drop"]) {
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), [name === "paste" ? "clipboardData" : "dataTransfer"]: { files: [file], items: [{ kind: "file", getAsFile: () => file }] } };
    listeners.get(name)!(event); expect(event.preventDefault).toHaveBeenCalledOnce(); expect(event.stopPropagation).toHaveBeenCalledOnce(); expect(delivered).toHaveBeenLastCalledWith([file]);
  }
  const text = { clipboardData: { items: [{ kind: "string", getAsFile: () => null }] }, preventDefault: vi.fn() };
  listeners.get("paste")!(text); expect(text.preventDefault).not.toHaveBeenCalled(); expect(delivered).toHaveBeenCalledTimes(2);
  cleanup(); expect(listeners.size).toBe(0);
});
