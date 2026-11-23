import type { PaseoApi } from "@getpaseo/client";
import type { TimelineCursor } from "../shared/session-tail";
import { nativeSession } from "./native-session";

/** Match only conversation text, in bounded chunks; never serialize tool payloads. */
export function conversationMatches(text: unknown, query: string): boolean {
  if (typeof text !== "string") return false;
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(word => {
    for (let offset = 0; offset < text.length; offset += 4096) {
      if (text.slice(offset, offset + 4096 + word.length).toLowerCase().includes(word)) return true;
    }
    return false;
  });
}

/** One authorized page; only a boolean and cursor cross the client connection. */
export async function searchSession(input: { workspaceId: string; agentId: string; query: string; cursor?: TimelineCursor }, paseo: PaseoApi) {
  await nativeSession(paseo, input);
  const page = await paseo.agents.ref(input.agentId).timeline.refetch({ direction: "after", limit: 16, projection: "projected", ...(input.cursor ? { cursor: input.cursor } : {}) });
  // Re-check the target after the asynchronous read, including moved workspace snapshots.
  await nativeSession(paseo, input);
  if (page.agent && (page.agent.id !== input.agentId || page.agent.workspaceId !== input.workspaceId)) throw new Error("Session moved during search.");
  if (page.error) throw new Error(page.error);
  if (page.reset || page.staleCursor || page.gap || input.cursor && page.epoch !== input.cursor.epoch) throw new Error("History changed; search again.");
  const matched = page.entries.some(row => {
    const item = row.item as { type?: string; text?: unknown };
    return ["user_message", "assistant_message", "reasoning"].includes(item.type ?? "") && conversationMatches(item.text, input.query);
  });
  if (page.hasNewer === undefined) throw new Error("Missing timeline pagination.");
  // Paseo reports hasNewer=true for the first, empty after-window without cursors.
  const emptyHistory = !input.cursor && !page.entries.length && !page.startCursor && !page.endCursor;
  if (matched || page.hasNewer === false || emptyHistory) return { matched, nextCursor: null };
  const next = page.endCursor;
  if (!next || next.epoch !== page.epoch || next.seq < 0 || input.cursor && next.seq <= input.cursor.seq) throw new Error("Timeline cursor did not advance.");
  return { matched: false, nextCursor: next };
}
