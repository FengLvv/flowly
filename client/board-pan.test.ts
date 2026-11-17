import { describe, expect, test, vi } from "vitest";
import { createBoardPan, excludeBoardPan, hoveringBoardScrollbar } from "./board-pan";

const event = (x: number, extra = {}) => ({ nativeEvent: { pageX: x, pointerId: 1, pointerType: "mouse", button: 2, buttons: 2, ...extra }, preventDefault: vi.fn(), stopPropagation: vi.fn() });
function fixture() {
  const metrics = { enabled: true, offset: 200, viewport: 500, content: 1400 };
  const scrollTo = vi.fn((x: number) => { metrics.offset = x; });
  const active = vi.fn();
  const pan = createBoardPan({ metrics: () => metrics, scrollTo, active });
  const start = (e = event(400)) => pan.onPointerDown(e);
  return { pan, start, metrics, scrollTo, active };
}

describe("blank-area right drag", () => {
  test("only the mouse in the bottom scrollbar region reveals the scrollbar", () => {
    const frame = { x: 300, y: 200, width: 800, height: 600 };
    expect(hoveringBoardScrollbar({ pointerType: "mouse", pageX: 500, pageY: 792 }, frame)).toBe(true);
    for (const pointer of [
      { pointerType: "mouse", pageX: 500, pageY: 700 },
      { pointerType: "mouse", pageX: 500, pageY: 801 },
      { pointerType: "mouse", pageX: 299, pageY: 792 },
      { pointerType: "mouse", pageX: 1101, pageY: 792 },
      { pointerType: "touch", pageX: 500, pageY: 792 },
    ]) expect(hoveringBoardScrollbar(pointer, frame)).toBe(false);
  });
  test("content follows the mouse horizontally, clamps at each edge and reverses immediately", () => {
    const f = fixture(); f.start();
    f.pan.onPointerMove(event(300)); expect(f.metrics.offset).toBe(300);
    f.pan.onPointerMove(event(350)); expect(f.metrics.offset).toBe(250);
    f.pan.onPointerMove(event(-1000)); expect(f.metrics.offset).toBe(900);
    f.pan.onPointerMove(event(-990)); expect(f.metrics.offset).toBe(890);
    f.pan.onPointerMove(event(1000)); expect(f.metrics.offset).toBe(0);
    f.pan.onPointerMove(event(990)); expect(f.metrics.offset).toBe(10);
  });
  test.each([{ pointerType: "touch" }, { pointerType: "pen" }, { button: 0, buttons: 1 }, { button: 1, buttons: 4 }, { buttons: 3 }, { buttons: undefined }])("does not take unsupported presses %j", (n) => {
    const f = fixture(); f.start(event(400, n)); f.pan.onPointerMove(event(200));
    expect(f.active).not.toHaveBeenCalled(); expect(f.scrollTo).not.toHaveBeenCalled();
  });
  test.each([{ enabled: false }, { content: 500 }, { content: 400 }, { viewport: 0 }])("does not start without an eligible overflowing viewport %j", (m) => {
    const f = fixture(); Object.assign(f.metrics, m); f.start();
    f.pan.onPointerMove(event(200)); expect(f.scrollTo).not.toHaveBeenCalled(); expect(f.active).not.toHaveBeenCalled();
  });
  test.each(["onPointerUp", "onPointerCancel", "onPointerLeave", "onBlur", "cancel"] as const)("%s stops all further movement", (end) => {
    const f = fixture(); f.start(); f.pan[end](event(400)); f.pan.onPointerMove(event(100));
    expect(f.scrollTo).not.toHaveBeenCalled(); expect(f.active.mock.calls).toEqual([[true], [false]]);
  });
  test("a lost release or disabled surface cancels on the next move", () => {
    const f = fixture(); f.start(); f.pan.onPointerMove(event(300, { buttons: 0 })); f.pan.onPointerMove(event(100));
    expect(f.scrollTo).not.toHaveBeenCalled();
    f.start(); f.metrics.enabled = false; f.pan.onPointerMove(event(200)); expect(f.active).toHaveBeenLastCalledWith(false);
  });
  test("another pointer cannot move or release the mouse gesture", () => {
    const f = fixture(); f.start(); f.pan.onPointerMove(event(200, { pointerId: 2 })); f.pan.onPointerUp(event(200, { pointerId: 2 }));
    expect(f.scrollTo).not.toHaveBeenCalled(); f.pan.onPointerMove(event(300)); expect(f.metrics.offset).toBe(300);
  });
  test("uses the latest scroll offset, including intervening scrollbar/wheel movement", () => {
    const f = fixture(); f.start(); f.metrics.offset = 600; f.pan.onPointerMove(event(300)); expect(f.metrics.offset).toBe(700);
  });
  test("suppresses the gesture's menu even after release; a fresh excluded press keeps its own menu", () => {
    const f = fixture(); f.start(); f.pan.onPointerUp(event(400));
    const menu = event(400); f.pan.onContextMenu(menu); expect(menu.preventDefault).toHaveBeenCalled(); expect(menu.stopPropagation).toHaveBeenCalled();
    const cardPress = event(400); f.pan.exclude(cardPress);
    expect(cardPress.stopPropagation).toHaveBeenCalled();
    const ownMenu = event(400); f.pan.onContextMenu(ownMenu); expect(ownMenu.preventDefault).not.toHaveBeenCalled();
    const left = event(400, { button: 0 }); excludeBoardPan(left); expect(left.stopPropagation).not.toHaveBeenCalled();
  });
});
