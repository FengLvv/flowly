import { expect, test } from "vitest";
import { lastViewedProject, pickProject, rememberViewedProject, rememberViewedRuntime, restoreRuntimeView } from "./project-memory";

const projects = [{ id: "a" }, { id: "b" }, { id: "c" }];

test("cold start opens the first project", () => {
  expect(lastViewedProject()).toBe("");
  expect(restoreRuntimeView()).toBe(false);
  expect(pickProject(projects, "", lastViewedProject())?.id).toBe("a");
});

test("re-entering the board returns to the project viewed last in this run", () => {
  rememberViewedProject("c");
  rememberViewedProject(undefined);
  expect(pickProject(projects, "", lastViewedProject())?.id).toBe("c");
  expect(pickProject(projects, "b", lastViewedProject())?.id).toBe("b");
});

test("a removed or archived-away project falls back to the first", () => {
  expect(pickProject(projects.slice(0, 2), "", "c")?.id).toBe("a");
  expect(pickProject([], "", "c")).toBeUndefined();
});

test("warm Runtime return keeps its own identity without replacing the remembered project", () => {
  rememberViewedProject("c");
  rememberViewedRuntime();
  rememberViewedProject(undefined); // overview loading cannot overwrite Runtime
  expect(restoreRuntimeView()).toBe(true);
  expect(lastViewedProject()).toBe("c");
  expect(restoreRuntimeView(true)).toBe(false); // explicit native/card/idea entry wins
  expect(restoreRuntimeView()).toBe(true);
  rememberViewedProject("b");
  expect(restoreRuntimeView()).toBe(false);
  expect(pickProject(projects, "", lastViewedProject())?.id).toBe("b");
});

test("Runtime can be remembered even when there are no Flowly projects", () => {
  rememberViewedRuntime();
  expect(pickProject([], "", lastViewedProject())).toBeUndefined();
  expect(restoreRuntimeView()).toBe(true);
});
