import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { TimelineWindow } from "../shared/session-tail";

export const INACTIVE_TRANSCRIPTS = 12;
export const INACTIVE_TRANSCRIPT_TEXT = 1_000_000;
export const RETAINED_TRANSCRIPT_GC = Infinity;
const opened = new WeakMap<QueryClient, Map<string, QueryKey>>();

/** Bound retained history independently of live/hidden observers and other query families. */
export function trimTranscripts(client: QueryClient, openingId?: string) {
  const held = opened.get(client);
  if (!held) return;
  const inactive: { id: string; key: QueryKey; text: number }[] = [];
  let text = 0;
  held.forEach((key, id) => {
    const query = client.getQueryCache().find({ queryKey: key, exact: true });
    if (!query) { held.delete(id); return; }
    if (id === openingId || query.getObserversCount()) return;
    const data = query.state.data as TimelineWindow | undefined;
    const size = data?.entries.reduce((sum, entry) => sum + (entry.item.text?.length ?? 0), 0) ?? 0;
    inactive.push({ id, key, text: size });
    text += size;
  });
  let count = inactive.length;
  inactive.forEach(window => {
    if (count <= INACTIVE_TRANSCRIPTS && text <= INACTIVE_TRANSCRIPT_TEXT) return;
    client.removeQueries({ queryKey: window.key, exact: true });
    held.delete(window.id);
    count--;
    text -= window.text;
  });
}

/** Touch on open, release after observer cleanup. No timer or subscription outlives the pane. */
export function retainTranscript(client: QueryClient, key: QueryKey) {
  let held = opened.get(client);
  if (!held) {
    held = new Map();
    // Adopt an older client bundle's retained windows too: plugin reload must
    // not leave infinite-lifetime queries outside the new retention budget.
    client.getQueryCache().findAll({ queryKey: ["flowly", "transcript"] })
      .sort((a, b) => a.state.dataUpdatedAt - b.state.dataUpdatedAt)
      .forEach(query => held!.set(JSON.stringify(query.queryKey), query.queryKey));
    opened.set(client, held);
  }
  const id = JSON.stringify(key);
  held.delete(id);
  held.set(id, key);
  // An effect can run before useQuery's observer subscription is attached.
  // The window being opened is already in use even in that short interval.
  trimTranscripts(client, id);
  return () => { void Promise.resolve().then(() => trimTranscripts(client)); };
}
