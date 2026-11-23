import type { TimelineCursor } from "../shared/session-tail";

export type SearchCandidate = { id: string; workspaceId?: string; query: string; version: string };
type Loader = (input: { agentId: string; workspaceId: string; query: string; cursor?: TimelineCursor }) => Promise<{ matched: boolean; nextCursor: TimelineCursor | null }>;
type RecordState = { candidate: SearchCandidate; key: string; state: "pending" | "match" | "none" | "error"; cursor?: TimelineCursor };
type Snapshot = { matches: ReadonlySet<string>; pending: number; errors: number };

/** Two pages at a time across all generations; obsolete results cannot leak into a new query. */
export function createRuntimeSearch(load: Loader) {
  let records = new Map<string, RecordState>(), active = false, inflight = 0;
  const queue = new Set<string>(), listeners = new Set<() => void>();
  let snapshot: Snapshot = { matches: new Set(), pending: 0, errors: 0 };
  const publish = () => {
    const rows = [...records.values()];
    snapshot = { matches: new Set(rows.filter(r => r.state === "match").map(r => r.candidate.id)), pending: rows.filter(r => r.state === "pending").length, errors: rows.filter(r => r.state === "error").length };
    listeners.forEach(fn => fn());
  };
  // Separate activation per request: Hermes must not capture a loop body's bindings.
  const start = (id: string, record: RecordState) => {
      const candidate = record.candidate;
      inflight++;
      void Promise.resolve().then(() => load({ agentId: id, workspaceId: candidate.workspaceId!, query: candidate.query, ...(record.cursor ? { cursor: record.cursor } : {}) })).then(page => {
        if (records.get(id) !== record) return;
        if (page.matched) record.state = "match";
        else if (page.nextCursor) {
          if (record.cursor && (page.nextCursor.epoch !== record.cursor.epoch || page.nextCursor.seq <= record.cursor.seq)) throw new Error("Search cursor did not advance.");
          record.cursor = page.nextCursor; queue.add(id);
        } else record.state = "none";
        publish();
      }).catch(() => { if (records.get(id) === record) { record.state = "error"; publish(); } })
        .finally(() => { inflight--; pump(); });
  };
  const pump = () => {
    while (active && inflight < 2 && queue.size) {
      const id = queue.values().next().value!; queue.delete(id);
      const record = records.get(id);
      if (!record || record.state !== "pending") continue;
      if (!record.candidate.workspaceId) { record.state = "error"; publish(); continue; }
      start(id, record);
    }
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    read: () => snapshot,
    setActive(value: boolean) { active = value; pump(); },
    configure(candidates: readonly SearchCandidate[]) {
      const next = new Map<string, RecordState>();
      candidates.forEach(candidate => {
        const key = JSON.stringify([candidate.workspaceId, candidate.query, candidate.version]);
        const previous = records.get(candidate.id);
        const record = previous?.key === key ? previous : { candidate, key, state: "pending" as const };
        next.set(candidate.id, record);
        if (record !== previous) queue.add(candidate.id);
      });
      records = next;
      for (const id of queue) if (!records.has(id)) queue.delete(id);
      publish(); pump();
    },
    retry() {
      records.forEach((record, id) => { if (record.state === "error") { record.state = "pending"; record.cursor = undefined; queue.add(id); } });
      publish(); pump();
    },
  };
}
