import { expect, test } from "vitest";
import { displayableImage, extractImages, localImagePath } from "./images";

test("pasted-image placeholders and markdown images are extracted in order", () => {
  const r = extractImages("Look at this [Image: source: /private/tmp/a/images/1.png]\nand ![chart](https://x.y/c.png) ok");
  expect(r.images).toEqual([
    { src: "/private/tmp/a/images/1.png", alt: "Image" },
    { src: "https://x.y/c.png", alt: "chart" },
  ]);
  expect(r.text).toBe("Look at this \nand  ok".replace(/[ \t]+\n/g, "\n"));
});

test("non-image or relative references stay as text; duplicates collapse", () => {
  const r = extractImages("![doc](notes.md) ![rel](img/a.png) ![x](file:///tmp/a.jpg) ![y](file:///tmp/a.jpg)");
  expect(r.images).toEqual([{ src: "file:///tmp/a.jpg", alt: "x" }]);
  expect(r.text).toContain("![doc](notes.md)");
  expect(r.text).toContain("![rel](img/a.png)");
});

test("displayable and local path rules", () => {
  expect(displayableImage("/a/b.PNG")).toBe(true);
  expect(displayableImage("/a/b.txt")).toBe(false);
  expect(displayableImage("relative.png")).toBe(false);
  expect(displayableImage("https://x/y")).toBe(true);
  expect(localImagePath("file:///a/b.png")).toBe("/a/b.png");
  expect(localImagePath("https://x/y.png")).toBeNull();
});

test.each([
  ["C:\\images\\shot.PNG", "C:\\images\\shot.PNG"],
  ["C:/images/shot.png", "C:/images/shot.png"],
  ["\\\\host\\share\\shot.png", "\\\\host\\share\\shot.png"],
  ["file:///C:/images/a%20b%23c.png", "C:/images/a b#c.png"],
  ["file://host/share/a%20b.png", "//host/share/a b.png"],
  ["file:///tmp/a%20b.png", "/tmp/a b.png"],
])("absolute image references work across platforms: %s", (src, path) => {
  expect(localImagePath(src)).toBe(path);
  expect(displayableImage(src)).toBe(true);
  expect(extractImages(`[Image: source: ${src}]`).images).toEqual([{ src, alt: "Image" }]);
});

test.each(["C:relative.png", "relative.png", "file:relative.png", "file:///tmp/bad%2fpath.png", "file:///tmp/bad%5cpath.png", "file:///tmp/bad%00.png", "file:///tmp/a.png?x=1", "\\\\.\\pipe\\a.png", "ftp://host/a.png"])("unsafe or relative local references are refused: %s", src => {
  expect(localImagePath(src)).toBeNull();
  expect(displayableImage(src)).toBe(false);
});
