import type { PaseoAgent, PaseoApi } from "@getpaseo/client";
import type { BoardStore } from "./store";
import type { SessionReadStore } from "./session-reads";
import { attentionFromSources } from "../shared/attention";
import { isSummarizer } from "../shared/summary";
import { runtimeGroups } from "../shared/runtime-view";

/** Keep all board/history/agent decoding on the daemon for the native sidebar. */
export async function readAttentionCount(store: Pick<BoardStore, "read">, reads: Pick<SessionReadStore, "read">, paseo: PaseoApi) {
  const result = await readSidebarCounts(store, reads, paseo);
  return { count: result.attention };
}

/** One tiny projection for both badges; never transfer the agent list to the sidebar. */
export async function readSidebarCounts(store: Pick<BoardStore, "read">, reads: Pick<SessionReadStore, "read">, paseo: PaseoApi) {
  const list = async () => {
    const agents: PaseoAgent[] = [];
    let cursor: string | undefined;
    do {
      const page = await paseo.agents.list({ filter: { includeArchived: false }, page: { limit: 200, cursor } });
      for (const { agent } of page.entries) if (!isSummarizer(agent)) agents.push(agent);
      cursor = page.pageInfo.nextCursor ?? undefined;
    } while (cursor);
    return agents;
  };
  const [board, agents, receipts] = await Promise.all([store.read(), list(), reads.read().catch(() => null)]);
  const items = attentionFromSources({ board, agents, receipts: receipts?.receipts || [], readUnavailable: !receipts });
  const running = runtimeGroups(agents, [], true).find(group => group.id === "running")!.sessions.length;
  return { attention: items!.length, running };
}
