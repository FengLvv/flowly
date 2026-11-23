import type { PaseoAgent } from "@getpaseo/client";
import type { RuntimeGroup } from "./runtime-view";
import { parentOf } from "./subagents";

export type RuntimeRange = "24h" | "7d" | "all";
export const runtimeSortKeys = ["title", "project", "workspace", "folder", "created", "updated", "context"] as const;
export type RuntimeSortKey = typeof runtimeSortKeys[number];
export type RuntimeSort = { key: RuntimeSortKey; direction: "asc" | "desc" } | null;
export type RuntimeLocation = { name: string; owner: string; path: string };
export type RuntimeLocationOf = (agent: PaseoAgent) => RuntimeLocation | undefined;

export function runtimeSearchText(agent: PaseoAgent, location?: RuntimeLocation): string {
  return [agent.title, agent.id, agent.workspaceId, agent.cwd, agent.provider, agent.model,
    location?.name, location?.owner, location?.path, ...Object.values(agent.labels ?? {})].filter(Boolean).join(" ").toLowerCase();
}
export const searchWords = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);
export function remainingSearch(agent: PaseoAgent, query: string, location?: RuntimeLocation): string {
  const text = runtimeSearchText(agent, location);
  return searchWords(query).filter(word => !text.includes(word)).join(" ");
}

function at(value: string | null | undefined): number | null {
  const result = value ? Date.parse(value) : NaN;
  return Number.isFinite(result) ? result : null;
}
function text(value: string | undefined): string | null { return value?.trim() || null; }
function value(agent: PaseoAgent, key: RuntimeSortKey, location?: RuntimeLocation): string | number | null {
  switch (key) {
    case "title": return text(agent.title ?? undefined);
    case "project": return text(location?.owner);
    case "workspace": return text(location?.name);
    case "folder": return text(location?.path || agent.cwd);
    case "created": return at(agent.createdAt);
    case "updated": return at(agent.updatedAt);
    case "context": {
      const usage = agent.lastUsage;
      const used = usage?.contextWindowUsedTokens, max = usage?.contextWindowMaxTokens;
      return typeof used === "number" && Number.isFinite(used) && used >= 0 && typeof max === "number" && Number.isFinite(max) && max > 0 ? used / max : null;
    }
  }
}

export function runtimeNameCompare(locale: string): (a: string, b: string) => number {
  try { return new Intl.Collator(locale.startsWith("zh") ? "zh-Hans-u-co-pinyin" : locale, { numeric: true, sensitivity: "base" }).compare; }
  catch { return (a, b) => { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }; }
}

/** Filtering never changes native state or merges conversations; ties retain the source order. */
export function filterRuntime(groups: readonly RuntimeGroup[], options: {
  query: string; range: RuntimeRange; sort: RuntimeSort; now: number;
  locationOf: RuntimeLocationOf; compareNames: (a: string, b: string) => number;
  conversationMatches?: ReadonlySet<string>;
  hideSubagents?: boolean;
}): RuntimeGroup[] {
  const { query, range, sort, now, locationOf, compareNames, conversationMatches } = options;
  const cutoff = range === "all" ? null : now - (range === "24h" ? 1 : 7) * 86400_000;
  return groups.map(group => {
    const sessions = group.sessions.filter(agent => {
      const parent = options.hideSubagents ? parentOf(agent) : null;
      if (parent && parent !== agent.id) return false;
      if (remainingSearch(agent, query, locationOf(agent)) && !conversationMatches?.has(agent.id)) return false;
      if (cutoff === null || (group.id !== "idle" && group.id !== "archived")) return true;
      const time = at(group.id === "archived" ? agent.archivedAt : agent.attentionTimestamp ?? agent.lastUserMessageAt ?? agent.createdAt);
      return time === null || time >= cutoff;
    });
    if (!sort) return { ...group, sessions };
    const sign = sort.direction === "asc" ? 1 : -1;
    const ranked = sessions.map((agent, index) => ({ agent, index, key: value(agent, sort.key, locationOf(agent)) }));
    ranked.sort((a, b) => {
      if (a.key === null || b.key === null) return a.key === b.key ? a.index - b.index : a.key === null ? 1 : -1;
      const order = typeof a.key === "string" && typeof b.key === "string" ? compareNames(a.key, b.key) : Number(a.key) - Number(b.key);
      return order * sign || a.index - b.index;
    });
    return { ...group, sessions: ranked.map(row => row.agent) };
  });
}
