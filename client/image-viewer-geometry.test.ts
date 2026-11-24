import { describe, expect, it } from "vitest";
import { boundView, fitImage, fitView, zoomImage } from "./image-viewer-geometry";

describe("image viewer geometry", () => {
  const viewport = { width: 400, height: 300 };

  it("fits wide and tall images on their limiting axis", () => {
    expect(fitImage({ width: 800, height: 400 }, viewport)).toEqual({ width: 400, height: 200 });
    expect(fitImage({ width: 100, height: 300 }, viewport)).toEqual({ width: 100, height: 300 });
  });

  it("keeps the point under the cursor stationary while zooming", () => {
    expect(zoomImage(fitView, 2, { x: 80, y: -25 }, viewport, viewport))
      .toEqual({ zoom: 2, x: -80, y: 25 });
  });

  it("bounds panning at the image edges, including after resizing", () => {
    expect(boundView({ zoom: 2, x: 300, y: -300 }, { width: 400, height: 100 }, viewport))
      .toEqual({ zoom: 2, x: 200, y: 0 });
    const resized = { width: 640, height: 300 };
    expect(boundView({ zoom: 2, x: 300, y: -300 }, { width: 400, height: 100 }, resized))
      .toEqual({ zoom: 2, x: 80, y: 0 });
  });

  it("caps magnification and recenters when returning to fit", () => {
    const zoomed = zoomImage(fitView, 20, { x: 10, y: 10 }, viewport, viewport);
    expect(zoomed.zoom).toBe(8);
    expect(zoomImage(zoomed, 0.01, { x: 25, y: 30 }, viewport, viewport))
      .toMatchObject({ zoom: 1, x: 0, y: 0 });
  });
});
