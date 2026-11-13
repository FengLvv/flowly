import { createHash } from "node:crypto";
import { classifyQuery, connectorLimits, type ExternalSummary } from "../../shared/connectors";
import { splitTapdKey, tapdId, tapdItemType, tapdItemUrl, tapdKey, tapdKinds, tapdLongId, tapdProject, type TapdKind } from "../../shared/tapd";
import { cut, ExternalError, mapLimit, type StoredConnection } from "./http";
import { readTapd, type TapdCall, type TapdTool } from "./tapd-mcp";
import { storageToMarkdown } from "./storage-markdown";
import type { ConnectorAdapter, Fetched, ItemRef } from "./types";

type Row = Record<string, unknown>;
type Full = { item: Row; comments: Row[] };
const text = (x: unknown) => typeof x === "string" ? x : typeof x === "number" && Number.isSafeInteger(x) ? String(x) : "";
const markdown = (x: unknown) => {
  const s = text(x);
  return /<\/?(?:p|div|br|table|img|a|h[1-6]|ul|ol|li|span|strong|em)\b/i.test(s) ? storageToMarkdown(s) : s;
};
const tools: Record<TapdKind, TapdTool> = { story: "stories_get", bug: "bugs_get", task: "tasks_get" };
const fields = "id,name,title,description,status,v_status,priority,priority_label,owner,current_owner,modified,workspace_id";
function rows(value: unknown): Row[] {
  const data = Array.isArray(value) ? value : value && typeof value === "object" ? (value as Row).data : undefined;
  if (!Array.isArray(data)) throw new ExternalError("EXTERNAL_INVALID", "TAPD returned an invalid item list.");
  return data.map((v) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new ExternalError("EXTERNAL_INVALID", "TAPD returned an invalid item.");
    const row = v as Row;
    const wrapped = row.Story || row.Bug || row.Task || row.Comment || row.Workspace;
    return wrapped && typeof wrapped === "object" ? wrapped as Row : row;
  });
}
function project(c: StoredConnection) {
  const id = tapdProject(c.baseUrl);
  if (!id) throw new ExternalError("EXTERNAL_INVALID", "Enter a Tencent internal TAPD project address: https://tapd.woa.com/tapd_fe/<project-id>.");
  return id;
}
function summary(c: StoredConnection, kind: TapdKind, row: Row): ExternalSummary {
  const id = text(row.id), workspace = text(row.workspace_id);
  if (!tapdLongId(id) || !workspace || workspace !== project(c)) throw new ExternalError("EXTERNAL_INVALID", "TAPD returned an item outside the requested project or an invalid ID.");
  const key = tapdKey(workspace, kind, id);
  return { connectionId: c.id, itemType: tapdItemType(kind), key, remoteId: id, url: tapdItemUrl(c.baseUrl, key), summary: text(row.name || row.title),
    status: text(row.v_status || row.status), statusCategory: "", type: kind, priority: text(row.priority_label || row.priority),
    assignee: text(row.owner || row.current_owner), container: c.account || workspace, updated: text(row.modified) };
}
const notFound = () => new ExternalError("EXTERNAL_NOT_FOUND", "TAPD work item not found in this project, or it is not visible to the connected account.");

export function createTapdAdapter(call: TapdCall = readTapd): ConnectorAdapter {
  async function longId(workspace: string, kind: TapdKind, id: string) {
    if (!tapdId(id)) throw new ExternalError("EXTERNAL_INVALID", "Invalid TAPD ID.");
    if (tapdLongId(id)) return id;
    const result = await call("tapd_id_get", { short_id: Number(id), type: kind });
    const mapped = rows(result).map((r) => (r.ShardIdMap || r) as Row).filter((r) => text(r.workspace_id) === workspace && r.type === kind && text(r.short_id) === id);
    const value = mapped.length === 1 ? text(mapped[0]!.long_id) : "";
    if (!tapdLongId(value)) throw notFound();
    return value;
  }
  async function get(c: StoredConnection, ref: ItemRef, full: boolean): Promise<Fetched> {
    const parsed = splitTapdKey(ref.key);
    if (!parsed || parsed.project !== project(c) || tapdItemType(parsed.kind) !== ref.itemType) throw new ExternalError("EXTERNAL_INVALID", "TAPD key does not belong to this connection and work item type.");
    const id = await longId(parsed.project, parsed.kind, parsed.id);
    const data = rows(await call(tools[parsed.kind], { workspace_id: parsed.project, id, limit: 1, page: 1, fields, ...(parsed.kind === "story" ? { with_v_status: "1" } : {}) }));
    if (!data.length) throw notFound();
    if (data.length !== 1 || text(data[0]!.id) !== id) throw new ExternalError("EXTERNAL_INVALID", "TAPD returned a different work item than requested.");
    const item = data[0]!;
    const s = summary(c, parsed.kind, item);
    if (!full) return { summary: s };
    const comments = rows(await call("comments_get", { workspace_id: parsed.project, entry_type: parsed.kind, entry_id: id, page: 1, limit: connectorLimits.comments }));
    for (const comment of comments) {
      if ((comment.workspace_id && text(comment.workspace_id) !== parsed.project) || (comment.entry_id && text(comment.entry_id) !== id))
        throw new ExternalError("EXTERNAL_INVALID", "TAPD returned comments for another work item.");
    }
    return { summary: s, full: { item, comments } satisfies Full };
  }
  return {
    label: "TAPD", readBytes: connectorLimits.readBytes, updatedCoversContent: false,
    async verify(c) {
      const id = project(c);
      const projects = rows(await call("user_participant_workspace_get", {}));
      const found = projects.find((p) => text(p.id) === id);
      if (!found) throw new ExternalError("EXTERNAL_AUTH", "This TAPD project is not accessible through the host's tapd MCP account. Check the project address and MCP login.");
      return { account: text(found.name) || id, login: "" };
    },
    async search(c, _fetch, query) {
      const q = classifyQuery(query, c);
      if (q.kind === "key") return [await get(c, q, false)];
      // A foreign or invalid URL/key must never become a broad title search.
      if (/^(?:https?:\/\/|tapd:|(?:story|bug|task)-)/i.test(query) && q.kind === "text") throw new ExternalError("EXTERNAL_INVALID", "This is not a supported TAPD work item in the connected project.");
      const id = project(c);
      if (q.kind === "number") {
        const found = await mapLimit(tapdKinds, 3, async (kind) => {
          try { return await get(c, { key: tapdKey(id, kind, q.number), itemType: tapdItemType(kind) }, false); }
          catch (e) { if (e instanceof ExternalError && e.code === "EXTERNAL_NOT_FOUND") return null; throw e; }
        });
        return found.filter((v): v is Fetched => !!v);
      }
      if (q.kind !== "recent" && q.kind !== "text") return [];
      // TAPD's query language uses operators in field values: title input stays literal.
      const title = q.kind === "text" ? q.text.replace(/[<>|*~\\]/g, " ").replace(/^TQL\s*/i, "").trim() : "";
      if (q.kind === "text" && !title) return [];
      const found = await mapLimit(tapdKinds, 3, async (kind) => {
        const data = rows(await call(tools[kind], { workspace_id: id, limit: q.kind === "recent" ? connectorLimits.recent : connectorLimits.search, page: 1, fields,
          ...(kind !== "task" ? { order: "modified desc" } : {}), ...(kind === "story" ? { with_v_status: "1" } : {}), ...(title ? { [kind === "bug" ? "title" : "name"]: title } : {}) }));
        return data.map((item) => ({ summary: summary(c, kind, item) }));
      });
      return found.flat().sort((a, b) => b.summary.updated.localeCompare(a.summary.updated)).slice(0, q.kind === "recent" ? connectorLimits.recent : connectorLimits.search);
    },
    get: (c, _fetch, ref, full) => get(c, ref, full),
    async getMany(c, _fetch, refs) {
      const found = await mapLimit(refs, 3, async (ref) => {
        try { return await get(c, ref, false); }
        catch (e) { if (e instanceof ExternalError && e.code === "EXTERNAL_NOT_FOUND") return null; throw e; }
      });
      return found.filter((v): v is Fetched => !!v);
    },
    description(full) { return markdown((full as Full).item.description).slice(0, 20000); },
    fingerprint(full) {
      const { item, comments } = full as Full;
      return createHash("sha256").update(JSON.stringify([item.name || item.title, item.description, comments.map((c) => [c.id, c.description || c.content, c.modified || c.created])])).digest("hex").slice(0, 16);
    },
    markdown(s, full, limit) {
      const { item, comments } = full as Full;
      const sections = [`# ${s.key} ${s.summary}`, s.url, "", `- Status (reference only): ${s.status}`, `- Type: ${s.type}`, `- Priority: ${s.priority}`, `- Owner: ${s.assignee}`, `- Updated: ${s.updated}`, "", "## Description", "", markdown(item.description) || "(empty)"];
      if (comments.length) sections.push("", `## Comments (up to ${connectorLimits.comments})`);
      for (const c of comments) sections.push("", `### ${text(c.author || c.creator)} · ${text(c.modified || c.created)}`, "", markdown(c.description || c.content));
      return cut(sections.join("\n"), s.url, limit);
    },
  };
}
export const tapdAdapter = createTapdAdapter();
