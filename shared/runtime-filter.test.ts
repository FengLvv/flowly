import { expect, test } from "vitest";
import type { PaseoAgent } from "@getpaseo/client";
import { filterRuntime, remainingSearch, runtimeNameCompare } from "./runtime-filter";
import { runtimeGroups, type RuntimeGroup, type RuntimeLane } from "./runtime-view";
import { parentAgentLabel } from "./subagents";
const now = Date.parse("2026-11-17T00:00:00Z"), day = 86400_000;
const agent = (id: string, extra = {}) => ({ id, workspaceId: "w", title: id, status: "idle", requiresAttention: false, updatedAt: new Date(now).toISOString(), createdAt: new Date(now).toISOString(), ...extra } as PaseoAgent);
const options = { query: "", range: "all" as const, sort: null, now, locationOf: () => undefined, compareNames: runtimeNameCompare("en") };
const group = (sessions: PaseoAgent[], id: RuntimeLane = "idle"): RuntimeGroup[] => [{ id, sessions }];
const ids = (groups: RuntimeGroup[]) => groups.flatMap(g => g.sessions.map(a => a.id));

test("child visibility defaults to shown and only hides explicit native child labels", () => {
  const source = group([
    agent("main", { title: "Subagent-looking ordinary conversation" }),
    agent("child", { labels: { [parentAgentLabel]: " main " } }),
    agent("blank", { labels: { [parentAgentLabel]: "  " } }),
    agent("self", { labels: { [parentAgentLabel]: " self " } }),
    agent("detached", { labels: { "paseo.parent-origin-id": "main" } }),
  ]);
  const snapshot = JSON.stringify(source);
  expect(ids(filterRuntime(source, options))).toEqual(["main", "child", "blank", "self", "detached"]);
  expect(ids(filterRuntime(source, { ...options, hideSubagents: true }))).toEqual(["main", "blank", "self", "detached"]);
  expect(JSON.stringify(source)).toBe(snapshot);
});

test("nested/orphan/cross-workspace children hide in every runtime group, including archived/unknown", () => {
  const source = (["attention", "running", "review", "idle", "archived", "unavailable"] as const).map(id => ({ id, sessions: [
    agent(id + "-main"), agent(id + "-child", { workspaceId: "another", labels: { [parentAgentLabel]: "missing-parent" } }),
    agent(id + "-grandchild", { labels: { [parentAgentLabel]: id + "-child" } }),
  ] }));
  expect(ids(filterRuntime(source, { ...options, hideSubagents: true }))).toEqual(source.map(g => g.id + "-main"));
});

test("search matches cannot reintroduce hidden children and range/sort remain an intersection", () => {
  const source = group([agent("parent"), agent("child", { labels: { [parentAgentLabel]: "parent" } }), agent("old", { createdAt: "2020-01-01" })]);
  expect(ids(filterRuntime(source, { ...options, hideSubagents: true, query: "body", range: "7d", conversationMatches: new Set(["parent", "child", "old"]), sort: { key: "title", direction: "desc" } }))).toEqual(["parent"]);
  // The same first-pass list supplies transcript search candidates; hidden children have no slot to schedule.
  expect(ids(filterRuntime(source, { ...options, hideSubagents: true }))).not.toContain("child");
});

test("visibility reads newest metadata after deduplication and does not rewrite native groups", () => {
  const older = agent("same", { updatedAt: "2020-01-01", labels: { [parentAgentLabel]: "parent" } });
  const newer = agent("same", { labels: {} });
  const all = runtimeGroups([older, newer], [], false);
  expect(ids(filterRuntime(all, { ...options, hideSubagents: true }))).toEqual(["same"]);
  const relabelled = runtimeGroups([newer, { ...newer, updatedAt: "2030-01-01", labels: { [parentAgentLabel]: "parent" } }], [], false);
  expect(ids(filterRuntime(relabelled, { ...options, hideSubagents: true }))).toEqual([]);
  expect(ids(relabelled)).toEqual(["same"]);
});

test("metadata search is case insensitive AND across actual fields and labels; blank restores", () => {
  const a = agent("id", { title: "Fix Render", provider: "codex", labels: { custom: "lighting" } });
  const location = { name: "Worktree", owner: "QS", path: "F:/Project" };
  expect(remainingSearch(a, "RENDER QS codex lighting", location)).toBe("");
  expect(remainingSearch(a, "Render missing two", location)).toBe("missing two");
  expect(ids(filterRuntime(group([a]), { ...options, query: " \n " }))).toEqual(["id"]);
});
test("latest native snapshot is deduplicated before search", () => {
  const groups = runtimeGroups([agent("a", { title: "old", updatedAt: "2026-01-01" }), agent("a", { title: "new" })], [], false);
  expect(ids(filterRuntime(groups, { ...options, query: "old" }))).toEqual([]);
});
test("range affects only idle and archived; cutoff inclusive and unknown remains", () => {
  const old = agent("old", { createdAt: new Date(now - 8 * day).toISOString(), lastUserMessageAt: new Date(now - 8 * day).toISOString() });
  const boundary = agent("boundary", { attentionTimestamp: new Date(now - day).toISOString() });
  const unknown = agent("unknown", { createdAt: undefined });
  expect(ids(filterRuntime(group([old, boundary, unknown]), { ...options, range: "24h" }))).toEqual(["boundary", "unknown"]);
  expect(ids(filterRuntime(group([old, boundary]), { ...options, range: "all" }))).toEqual(["old", "boundary"]);
  for (const id of ["running", "attention", "review", "unavailable"] as const) expect(ids(filterRuntime(group([old], id), { ...options, range: "24h" }))).toEqual(["old"]);
  expect(ids(filterRuntime(group([agent("archived", { archivedAt: new Date(now - 8 * day).toISOString() })], "archived"), { ...options, range: "7d" }))).toEqual([]);
});
test("fresh daemon updatedAt never makes old idle work recent", () => {
  expect(ids(filterRuntime(group([agent("a", { createdAt: "2020-01-01", updatedAt: new Date(now).toISOString() })]), { ...options, range: "7d" }))).toEqual([]);
});
test("both directions keep nulls last and ties stable without changing the group or source", () => {
  const source = group([agent("two", { title: "item2" }), agent("ten", { title: "Item10" }), agent("tie", { title: "ITEM2" }), agent("null", { title: null })]);
  expect(ids(filterRuntime(source, { ...options, sort: { key: "title", direction: "asc" } }))).toEqual(["two", "tie", "ten", "null"]);
  expect(ids(filterRuntime(source, { ...options, sort: { key: "title", direction: "desc" } }))).toEqual(["ten", "two", "tie", "null"]);
  expect(ids(source)).toEqual(["two", "ten", "tie", "null"]);
});
test("context sorts actual fractions; zero usage valid, missing/max-zero last", () => {
  const source = group([agent("high", { lastUsage: { contextWindowUsedTokens: 8, contextWindowMaxTokens: 10 } }), agent("none"), agent("zero", { lastUsage: { contextWindowUsedTokens: 0, contextWindowMaxTokens: 10 } }), agent("invalid", { lastUsage: { contextWindowUsedTokens: 20, contextWindowMaxTokens: 0 } })]);
  expect(ids(filterRuntime(source, { ...options, sort: { key: "context", direction: "asc" } }))).toEqual(["zero", "high", "none", "invalid"]);
});
test("conversation matches supplement metadata without bypassing range", () => {
  const groups = group([agent("match"), agent("old", { createdAt: "2020-01-01" }), agent("other")]);
  expect(ids(filterRuntime(groups, { ...options, query: "body", range: "7d", conversationMatches: new Set(["match", "old"]) }))).toEqual(["match"]);
});
