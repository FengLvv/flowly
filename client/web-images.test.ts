import { afterEach, expect, test, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

async function reader(failName?: string) {
  const bytes = new Uint8Array(5 * 1024 * 1024 + 1).fill(7);
  const large = Buffer.from(bytes).toString("base64");
  vi.stubGlobal("FileReader", class {
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;
    result: unknown;
    readAsDataURL(file: { name: string; type: string; size: number }) {
      this.result = `data:${file.type};base64,${file.size > 5 * 1024 * 1024 ? large : "AQID"}`;
      queueMicrotask(() => file.name === failName ? this.onerror?.() : this.onload?.());
    }
  });
  return { ...(await import("./web-images")), large };
}

test("picker, paste and drop share a reader that keeps large images and whole batches in order", async () => {
  const { readImages, large } = await reader();
  const files = Array.from({ length: 12 }, (_, i) => ({ name: `image-${i}.png`, type: "image/png", size: i ? 3 : 5 * 1024 * 1024 + 1 }));
  const result = await readImages(files);
  expect(result.problems).toEqual([]);
  expect(result.images.map((i) => i.name)).toEqual(files.map((f) => f.name));
  expect(result.images[0].data).toBe(large);
  expect(result.images[0].uri).toBe(`data:image/png;base64,${large}`);
  expect(new Set(result.images.map((i) => i.id)).size).toBe(12);
});

test("unsupported formats are still reported and read failures do not yield a partial selection", async () => {
  const { readImages } = await reader("broken.png");
  const png = { name: "good.png", type: "image/png", size: 3 };
  const result = await readImages([png, { ...png, name: "vector.svg", type: "image/svg+xml" }]);
  expect(result.images).toHaveLength(1);
  expect(result.problems).toHaveLength(1);
  await expect(readImages([png, { ...png, name: "broken.png" }])).rejects.toThrow(/Could not read/);
});
