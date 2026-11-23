import { expect, test } from "vitest";
import { createResizeDrag } from "./resize-drag";

function fixture() {
  const changes: number[] = [], ends: number[] = [];
  let starts = 0;
  const target = { width: 560, maxWidth: 720, enabled: true,
    onChange: (width: number) => { target.width = width; changes.push(width); },
    onStart: () => { starts++; }, onEnd: () => { ends.push(target.width); } };
  const drag = createResizeDrag(() => target);
  return { target, drag, changes, ends, starts: () => starts };
}

test("press/release without moving changes no width; duplicate endings and late moves are inert", () => {
  const f = fixture(); f.drag.start(); f.drag.end(); f.drag.end(); f.drag.move(50);
  expect(f.changes).toEqual([]); expect(f.ends).toEqual([560]); expect(f.starts()).toBe(1);
});

test("progressive moves use the grant width, not the width changed by the previous move", () => {
  const f = fixture(); f.drag.start(); f.drag.move(20); f.drag.move(40); f.drag.move(-40); f.drag.end();
  expect(f.changes).toEqual([540, 520, 600]); expect(f.ends).toEqual([600]);
});

test("bounds are read as the available surface changes; reversed movement still works", () => {
  const f = fixture(); f.drag.start(); f.drag.move(1000); f.drag.move(-1000);
  f.target.maxWidth = 448; f.drag.move(-200); f.drag.move(150); f.drag.end();
  expect(f.changes).toEqual([340, 720, 448, 410]); expect(f.ends).toEqual([410]);
});

test("release observes the final accepted width immediately without waiting for another render", () => {
  const f = fixture(); f.drag.start(); f.drag.move(127); f.drag.end();
  expect(f.ends).toEqual([433]);
});

test("closing, compact switching or disposal ends the old gesture once before a new pane", () => {
  const f = fixture(); f.drag.start(); f.drag.move(80); f.target.enabled = false;
  f.drag.move(-200); f.drag.end(); f.drag.end(); f.target.enabled = true; f.drag.move(-100);
  expect(f.changes).toEqual([480]); expect(f.ends).toEqual([480]);
  f.drag.start(); f.drag.move(-20); f.drag.end(); expect(f.ends).toEqual([480, 500]);
});

test("accessible width changes use the same bounds and completion/save callback", () => {
  const f = fixture(); f.drag.adjust(-1); f.drag.adjust(1); f.target.maxWidth = 580; f.drag.adjust(1);
  expect(f.changes).toEqual([500, 560, 580]); expect(f.ends).toEqual([500, 560, 580]); expect(f.starts()).toBe(0);
});

test("disabled gestures/actions and competing accessible input cannot affect another operation", () => {
  const f = fixture(); f.target.enabled = false; f.drag.start(); f.drag.adjust(1); f.drag.move(20); f.drag.end();
  expect(f.changes).toEqual([]); expect(f.ends).toEqual([]);
  f.target.enabled = true; f.drag.start(); f.drag.start(); f.drag.adjust(1); f.drag.move(30); f.drag.end();
  expect(f.starts()).toBe(1); expect(f.changes).toEqual([530]); expect(f.ends).toEqual([530]);
});

test("invalid pointer deltas do not corrupt the preferred width", () => {
  const f = fixture(); f.drag.start(); f.drag.move(NaN); f.drag.move(Infinity); f.drag.end();
  expect(f.changes).toEqual([]); expect(f.ends).toEqual([560]);
});
