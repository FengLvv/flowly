export type Size = { width: number; height: number };
type Point = { x: number; y: number };
export type ImageView = Point & { zoom: number };
export const fitView: ImageView = { x: 0, y: 0, zoom: 1 };
export const maxZoom = 8;

export function fitImage(image: Size, viewport: Size): Size {
  const scale = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

/** Two-thirds of the window, with the title bar and toolbar inside that budget. */
export function imageViewerSize(image: Size, window: Size, chromeHeight: number): Size {
  return fitImage(image, {
    width: Math.max(1, window.width * 2 / 3),
    height: Math.max(1, window.height * 2 / 3 - chromeHeight),
  });
}

export function boundView(view: ImageView, image: Size, viewport: Size): ImageView {
  const x = Math.max(0, (image.width * view.zoom - viewport.width) / 2);
  const y = Math.max(0, (image.height * view.zoom - viewport.height) / 2);
  return {
    zoom: view.zoom,
    x: x ? Math.max(-x, Math.min(x, view.x)) : 0,
    y: y ? Math.max(-y, Math.min(y, view.y)) : 0,
  };
}

export function zoomImage(view: ImageView, multiplier: number, anchor: Point, image: Size, viewport: Size): ImageView {
  const zoom = Math.max(1, Math.min(maxZoom, view.zoom * multiplier));
  const ratio = zoom / view.zoom;
  return boundView({
    zoom,
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
  }, image, viewport);
}
