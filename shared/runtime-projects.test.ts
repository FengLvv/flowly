import { expect, test } from "vitest";
import type { PaseoAgent } from "@getpaseo/client";
import { allRuntimeProjects, filterRuntimeProjects, runtimeWorkspaceProjects, toggleRuntimeProject } from "./runtime-projects";
import { filterRuntime, runtimeNameCompare } from "./runtime-filter";
import type { RuntimeGroup } from "./runtime-view";
const projects = [{ id: "flowly-a", paseoProjectId: "native-one" }, { id: "flowly-b", paseoProjectId: "native-two" }];
const tasks = [{ projectId: "flowly-a", workspaceId: "foreign-owner" }, { projectId: "flowly-b", workspaceId: "bound-b" }];
const workspaces = [{ id: "foreign-owner", projectId: "native-two" }, { id: "loose-a", projectId: "native-one" }, { id: "bound-b", projectId: "native-two" }, { id: "outside", projectId: "native-other" }];
const memberships = () => runtimeWorkspaceProjects(projects, tasks, workspaces);
const agent = (id: string, workspaceId?: string): PaseoAgent => ({ id, workspaceId, title: id, createdAt: "2026-11-17", updatedAt: "2026-11-17" } as PaseoAgent);
const groups: RuntimeGroup[] = [{ id: "idle", sessions: [agent("bound-a", "foreign-owner"), agent("loose-a", "loose-a"), agent("b", "bound-b"), agent("unbound", "outside"), agent("missing")] }, { id: "running", sessions: [] }];
const ids = (value: readonly RuntimeGroup[]) => value.flatMap(g => g.sessions.map(a => a.id));

test("explicit Flowly card wins over native owner; cardless root conversations are included", () => {
  const map = memberships();
  expect([...map.get("foreign-owner")!]).toEqual(["flowly-a"]);
  expect([...map.get("loose-a")!]).toEqual(["flowly-a"]);
  expect(map.get("outside")).toBeUndefined();
  expect(ids(filterRuntimeProjects(groups, map, { ids: ["flowly-a"], unlinked: false }))).toEqual(["bound-a", "loose-a"]);
});
test("project identity is the Flowly ID; native IDs never act as picker selections", () => {
  expect(ids(filterRuntimeProjects(groups, memberships(), { ids: ["native-one"], unlinked: false }))).toEqual([]);
  expect(filterRuntimeProjects(groups, memberships(), allRuntimeProjects)).toBe(groups);
});
test("multi-select and unlinked form a union, one native card each, groups retained", () => {
  const map = memberships(), only = filterRuntimeProjects(groups, map, { ids: [], unlinked: true });
  expect(ids(only)).toEqual(["unbound", "missing"]);
  const both = filterRuntimeProjects(groups, map, { ids: ["flowly-a", "flowly-b"], unlinked: false });
  expect(ids(both)).toEqual(["bound-a", "loose-a", "b"]);
  expect(both.map(g => g.id)).toEqual(["idle", "running"]);
  expect(ids(filterRuntimeProjects(groups, map, { ids: ["flowly-a"], unlinked: true }))).toEqual(["bound-a", "loose-a", "unbound", "missing"]);
});
test("archived card links stay in the overview mapping; missing native metadata cannot override them", () => {
  const map = runtimeWorkspaceProjects(projects, tasks, []);
  expect([...map.get("foreign-owner")!]).toEqual(["flowly-a"]);
  expect(ids(filterRuntimeProjects(groups, map, { ids: ["flowly-a"], unlinked: false }))).toEqual(["bound-a"]);
});
test("toggle last choice resets all; removed selection stays narrow until explicitly cleared", () => {
  const chosen = toggleRuntimeProject(allRuntimeProjects, "flowly-a");
  expect(toggleRuntimeProject(chosen, "flowly-a")).toEqual(allRuntimeProjects);
  const afterRemoval = runtimeWorkspaceProjects([projects[1]], tasks, workspaces);
  expect(ids(filterRuntimeProjects(groups, afterRemoval, chosen))).toEqual([]);
  expect(ids(filterRuntimeProjects(groups, afterRemoval, allRuntimeProjects))).toHaveLength(5);
});
test("text and conversation matches cannot bypass selected Flowly projects", () => {
  const scoped = filterRuntimeProjects(groups, memberships(), { ids: ["flowly-a"], unlinked: false });
  const result = filterRuntime(scoped, { query: "loose", range: "all", sort: { key: "title", direction: "desc" }, now: Date.now(), locationOf: () => undefined, compareNames: runtimeNameCompare("en"), conversationMatches: new Set(["b"]) });
  expect(ids(result)).toEqual(["loose-a"]);
  expect(groups[0].sessions).toHaveLength(5);
});
