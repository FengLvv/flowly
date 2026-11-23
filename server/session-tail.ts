import { nativeSession } from "./native-session";
import type { SessionTarget } from "../shared/session-target";
import type { PaseoApi } from "@getpaseo/client";
import type { BoardStore } from "./store";
import { HISTORY_PAGE, TURN_MAX_ENTRIES, slimTimeline, type TailPage, type TimelineCursor } from "../shared/session-tail";

type TailInput = SessionTarget & {
  limit: number;
  mode?: "tail" | "turn" | "before" | "after";
  cursor?: TimelineCursor;
  maxEntries?: number;
};

type RawPage = Awaited<ReturnType<ReturnType<PaseoApi["agents"]["ref"]>["timeline"]["refetch"]>>;
type RawEntry = RawPage["entries"][number];
export type SessionTailTiming = { totalMs: number; scopeMs: number; timelineMs: number; pages: number; entries: number };

/**
 * A card session's timeline without tool payloads (PERFORMANCE-SPEC §3), read
 * as the newest entries, the current turn, or one page next to a cursor
 * (SESSION-PANE-SPEC §1). Like `sessions.image`, the session must belong to the
 * card's workspace. Paging runs here, next to the daemon, so a phone makes one
 * request and receives only the slim result.
 */
export class SessionTailService {
  constructor(readonly store: BoardStore) {}

  async tail(input: TailInput, paseo: PaseoApi, trace?: (timing: SessionTailTiming) => void): Promise<TailPage> {
    const started = trace ? performance.now() : 0;
    const timing: SessionTailTiming = { totalMs: 0, scopeMs: 0, timelineMs: 0, pages: 0, entries: 0 };
    try {
      const expectedWorkspace = input.workspaceId
        ? (await nativeSession(paseo, input)).workspaceId
        : (await this.store.read()).tasks.find(t => t.id === input.taskId)?.workspaceId;
      if (!expectedWorkspace) throw new Error("Task not found.");
      if (trace) timing.scopeMs = performance.now() - started;
      const handle = paseo.agents.ref(input.agentId);
      const mode = input.mode ?? "tail";
      if ((mode === "before" || mode === "after") && !input.cursor) throw new Error("A cursor is required to page the timeline.");
      const read = async (options: Parameters<typeof handle.timeline.refetch>[0]) => {
        const start = trace ? performance.now() : 0;
        try {
          const response = await handle.timeline.refetch({ ...options, projection: "projected" });
          timing.pages++;
          timing.entries += response.entries.length;
          if (response.error) throw new Error(response.error);
          return response;
        } finally {
          if (trace) timing.timelineMs += performance.now() - start;
        }
      };
      const first =
        mode === "turn"
          ? await read({ direction: "tail", limit: Math.min(HISTORY_PAGE, input.maxEntries ?? TURN_MAX_ENTRIES) })
          : await read({ direction: mode, limit: input.limit, ...(input.cursor ? { cursor: input.cursor } : {}) });
      const agent = first.agent ?? (await handle.refresh())?.agent;
      if (!agent || agent.workspaceId !== expectedWorkspace)
        throw new Error("Session is unavailable or belongs to a different workspace.");
      if (first.reset || first.staleCursor) return { entries: [], epoch: first.epoch, reset: true };
      if (mode !== "turn") return page(first.entries, first);
      return await this.turn(first, read, input.maxEntries ?? TURN_MAX_ENTRIES);
    } finally {
      if (trace) {
        timing.totalMs = performance.now() - started;
        trace(timing);
      }
    }
  }

  /** Pages back from the end until the latest user message, the start, or `max` entries. */
  private async turn(first: RawPage, read: (options: { direction: "before"; cursor: TimelineCursor; limit: number }) => Promise<RawPage>, max: number) {
    let entries: RawEntry[] = [...first.entries];
    let last = first;
    const turnStart = () => entries.findLastIndex((e) => (e.item as { type?: unknown } | undefined)?.type === "user_message");
    while (turnStart() < 0 && last.hasOlder && last.startCursor && entries.length < max) {
      const next = await read({ direction: "before", cursor: last.startCursor, limit: Math.min(HISTORY_PAGE, max - entries.length) });
      // The timeline was rewritten while paging (compaction, reload): the client reads it again.
      if (next.reset || next.staleCursor || next.epoch !== first.epoch) return { entries: [], epoch: next.epoch, reset: true };
      if (!next.entries.length) {
        last = next;
        break;
      }
      entries = [...next.entries, ...entries];
      last = next;
    }
    const start = turnStart();
    if (start > 0) entries = entries.slice(start);
    else if (start < 0 && entries.length > max) entries = entries.slice(-max);
    const head = entries[0];
    const sequenced = typeof head?.seqStart === "number";
    const cursor = sequenced ? { epoch: first.epoch, seq: head.seqStart } : last.startCursor;
    // Without a sequence on the first entry there is no exact cursor to page back from.
    const hasOlder = sequenced ? start > 0 || last.hasOlder : start <= 0 && last.hasOlder;
    return page(entries, { ...last, epoch: first.epoch, hasNewer: first.hasNewer, startCursor: cursor, hasOlder });
  }
}

function page(entries: RawEntry[], meta: Pick<RawPage, "epoch" | "startCursor" | "hasOlder" | "hasNewer">): TailPage {
  return {
    entries: slimTimeline(entries),
    epoch: meta.epoch,
    startCursor: meta.startCursor ?? null,
    hasOlder: meta.hasOlder,
    hasNewer: meta.hasNewer,
  };
}
