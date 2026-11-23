import { expect, test, vi } from "vitest";
import { createLaneViewport } from "./lane-viewport-store";

const lanes = ["backlog", "todo", "design", "development", "test", "done"].map(id => ({ id, width: 280 }));
test("sibling collapse moves a later lane even when no sibling x layout event fires", () => {
  const view = createLaneViewport(lanes, 12, 12);
  view.setViewportWidth(1280);
  ["backlog", "todo", "design", "development"].forEach(id => view.setLaneWidth(id, 44));
  view.setViewportWidth(832); // opening the task sidebar
  expect(view.getSnapshot()).toContain("test");
  expect(view.getSnapshot()).toContain("done");
});
test("observed scroll updates during reveal; viewport shrink and return cannot freeze visible lanes", () => {
  const view = createLaneViewport(lanes, 12, 12);
  view.setViewportWidth(1280);
  view.observeScroll(171);
  view.setViewportWidth(832);
  view.observeScroll(904);
  expect(view.getSnapshot()).toContain("test");
  view.setViewportWidth(1280);
  expect(view.getSnapshot()).toContain("test");
});
test("reorder and dynamic removal use native identities, and discard removed width facts", () => {
  const view = createLaneViewport(lanes.slice(0, 3), 12, 12);
  view.setViewportWidth(290);
  expect(view.getSnapshot()).toEqual(["backlog"]);
  view.setLaneWidth("backlog", 44);
  view.configure([lanes[2], lanes[1]]);
  expect(view.getSnapshot()).toEqual(["design"]);
  view.setLaneWidth("backlog", 44); // late callback from removed lane
  view.configure([lanes[0], lanes[2], lanes[1]]);
  expect(view.getSnapshot()).toEqual(["backlog"]);
});
test("resize/content shrink clamps offset even if the native view emits no scroll event", () => {
  const view = createLaneViewport(lanes, 12, 12);
  view.setViewportWidth(300);
  view.observeScroll(1400);
  view.configure([lanes[4]]);
  expect(view.getSnapshot()).toEqual(["test"]);
  view.setViewportWidth(1000);
  expect(view.getSnapshot()).toEqual(["test"]);
  view.setViewportWidth(0);
  expect(view.getSnapshot()).toEqual([]);
  view.setViewportWidth(300);
  expect(view.getSnapshot()).toEqual(["test"]);
});
test("only membership changes notify; bad geometry, no-op scroll and unsubscription cost no render", () => {
  const view = createLaneViewport(lanes, 12, 12), listener = vi.fn();
  const stop = view.subscribe(listener);
  view.setViewportWidth(500);
  expect(listener).toHaveBeenCalledTimes(1);
  const same = view.getSnapshot();
  [1, 2, 3, 4].forEach(offset => view.observeScroll(offset));
  view.setLaneWidth("todo", NaN); view.setViewportWidth(Infinity); view.observeScroll(NaN);
  expect(view.getSnapshot()).toBe(same);
  expect(listener).toHaveBeenCalledTimes(1);
  stop(); view.observeScroll(900);
  expect(listener).toHaveBeenCalledTimes(1);
});
