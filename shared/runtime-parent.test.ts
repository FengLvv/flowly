import { expect, test } from "vitest";
import type { PaseoAgent } from "@getpaseo/client";
import { matchesRuntimeCard, runtimeParent, runtimeWorkspaceSessions } from "./runtime-parent";

test("a proven exact workspace binding returns the original card/project identity", () => {
  expect(runtimeParent("w", [{ id: "card", projectId: "p", workspaceId: "w" }], [{ id: "p" }]))
    .toEqual({ kind: "card", workspaceId: "w", taskId: "card", projectId: "p" });
});
test("unbound, missing-project and duplicate bindings keep a native workspace parent", () => {
  const task = { id: "card", projectId: "p", workspaceId: "w" };
  expect(runtimeParent("w", [], [])).toEqual({ kind: "workspace", workspaceId: "w" });
  expect(runtimeParent("w", [task], [])).toEqual({ kind: "workspace", workspaceId: "w" });
  expect(runtimeParent("w", [task, { ...task, id: "other" }], [{ id: "p" }])).toEqual({ kind: "workspace", workspaceId: "w" });
});
test("an unavailable ownership overview is pending rather than proof that a workspace is unbound", () => {
  expect(runtimeParent("w")).toEqual({ kind: "pending", workspaceId: "w" });
  expect(runtimeParent("w", [])).toEqual({ kind: "pending", workspaceId: "w" });
  expect(runtimeParent("w", undefined, [])).toEqual({ kind: "pending", workspaceId: "w" });
  expect(runtimeParent("w", [], [])).toEqual({ kind: "workspace", workspaceId: "w" });
});
test("no workspace has no invented parent; unrelated workspaces never supply a card", () => {
  expect(runtimeParent("", [], [])).toBeNull();
  expect(runtimeParent("w", [{ id: "card", workspaceId: "different", projectId: "p" }], [{ id: "p" }])).toEqual({ kind: "workspace", workspaceId: "w" });
});
test("archived or legacy bindings are still identities, without title/path/native-owner inference", () => {
  const task = { id: "old", projectId: "p", workspaceId: "legacy", archivedAt: "date" };
  expect(runtimeParent("legacy", [task], [{ id: "p" }])).toMatchObject({ kind: "card", taskId: "old", workspaceId: "legacy" });
});
const agent = (id: string, workspaceId: string, updatedAt: string, createdAt = id) => ({ id, workspaceId, updatedAt, createdAt }) as PaseoAgent;
test("card view and Escape delegation require the same rendered exact card/workspace/project", () => {
  const parent = { kind: "card" as const, taskId: "c", workspaceId: "w", projectId: "p" };
  expect(matchesRuntimeCard(parent, { id: "c", workspaceId: "w", projectId: "p" })).toBe(true);
  expect(matchesRuntimeCard(parent, undefined)).toBe(false);
  expect(matchesRuntimeCard(parent, { id: "c", workspaceId: "moved", projectId: "p" })).toBe(false);
  expect(matchesRuntimeCard(parent, { id: "c", workspaceId: "w", projectId: "other" })).toBe(false);
  expect(matchesRuntimeCard({ kind: "workspace", workspaceId: "w" }, { id: "c", workspaceId: "w", projectId: "p" })).toBe(false);
});
test("workspace rows include only exact native members and deduplicate live/history before filtering", () => {
  const rows = runtimeWorkspaceSessions("w", [agent("a", "w", "1"), agent("b", "w", "2"), agent("c", "other", "1")],
    [agent("a", "moved", "2"), agent("b", "w", "3")]);
  expect(rows.map(a => a.id)).toEqual(["b"]); expect(rows[0].updatedAt).toBe("3");
});
test("older live metadata cannot reintroduce a moved session; source arrays are not sorted in place", () => {
  const history = [agent("a", "moved", "3"), agent("b", "w", "2"), agent("c", "w", "1")];
  expect(runtimeWorkspaceSessions("w", history, [agent("a", "w", "1")]).map(a => a.id)).toEqual(["c", "b"]);
  expect(history.map(a => a.id)).toEqual(["a", "b", "c"]);
});
