import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import * as rpc from "../shared/rpc";
import type { SessionTarget } from "../shared/session-target";
import { AttachmentDraft } from "./attachment-draft";
import type { ComposerAttachment } from "./web-files";

const drafts = new Map<string, { draft: AttachmentDraft; timer?: ReturnType<typeof setTimeout>; users: number }>();
/** Network starts only when the selected session is visible. Global cache holds pending navigation writes. */
export function useAttachmentDraft(hostId: string, target: SessionTarget, enabled: boolean, revision = 0) {
  const read = useRpc(rpc.readAttachmentDraft), add = useRpc(rpc.addAttachmentDraft), remove = useRpc(rpc.removeAttachmentDraft);
  const key = JSON.stringify([hostId, target.taskId, target.workspaceId, target.agentId]);
  const entry = useMemo(() => {
    let found = drafts.get(key);
    if (!found) { found = { draft: new AttachmentDraft({ read: () => read(target), add: items => add({ ...target, items }), remove: ids => remove({ ...target, ids }) }), users: 0 }; drafts.set(key, found); }
    return found;
  }, [key]);
  entry.draft.io = { read: () => read(target), add: items => add({ ...target, items }), remove: ids => remove({ ...target, ids }) };
  const state = useSyncExternalStore(entry.draft.subscribe, entry.draft.snapshot, entry.draft.snapshot);
  useEffect(() => {
    entry.users++;
    if (entry.timer) clearTimeout(entry.timer);
    return () => {
      entry.users--;
      const evict = () => { if (entry.users) return; if (entry.draft.idle()) drafts.delete(key); else entry.timer = setTimeout(evict, 30_000); };
      entry.timer = setTimeout(evict, 30_000);
    };
  }, [entry]);
  useEffect(() => { if (enabled) void entry.draft.load(revision > state.revision && entry.draft.idle()); }, [entry, enabled, revision]);
  const files: ComposerAttachment[] = state.items.filter(item => item.kind !== "reference").map(item => ({ ...item, kind: item.kind as "image" | "file", data: item.data || "", uri: item.kind === "image" && item.data !== null ? `data:${item.mimeType};base64,${item.data}` : "", unavailable: item.data === null }));
  const references = state.items.flatMap(item => item.kind === "reference" ? [item.reference] : []);
  return { owner: entry.draft, state, files, references, ready: entry.draft.ready() };
}
