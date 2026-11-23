import { useEffect, useMemo, useRef, useState } from "react";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { settingsRpc } from "@getpaseo/plugin";
import { boardViewSettings, boardViewValues, type BoardView } from "../shared/settings";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const readBoardView = settingsRpc(boardViewSettings.id).read;

type Settings = {
  status: string;
  values?: unknown;
  revision?: string;
  save(values: BoardView, revision: string): Promise<boolean>;
  reload(): Promise<void>;
};

/**
 * Saves `patch` on top of the latest stored values; on a revision conflict
 * reloads and merges again (a few attempts). Returns whether it was stored.
 */
export async function saveMerged(read: () => Settings, patch: Partial<BoardView>, pause = wait,
  fresh?: () => Promise<{ status: string; values?: unknown; revision?: string }>, currentScope = () => true) {
  try {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!currentScope()) return false;
    const current = read();
    if (current.status !== "ready" || current.revision === undefined) {
      await pause(150);
      continue;
    }
    const source = fresh ? await fresh() : current;
    if (!currentScope() || source.status !== "ready" || source.revision === undefined) return false;
    const parsed = boardViewSettings.schema.safeParse(source.values);
    if (!parsed.success) return false;
    const base = parsed.data;
    const next = { ...base, ...patch };
    if (JSON.stringify(next) === JSON.stringify(base)) return true;
    if (await current.save(next, source.revision)) return true;
    // Someone else saved first: pick up their revision and merge again.
    await current.reload();
    await pause(50 * (attempt + 1));
  }
  } catch { return false; }
  return false;
}

/** An old in-flight value cannot overtake a later inverse or another local patch. */
export function serialViewWriter(save: (patch: Partial<BoardView>) => Promise<boolean>) {
  let tail = Promise.resolve(true);
  return (patch: Partial<BoardView>) => {
    const next = tail.then(() => save(patch), () => save(patch));
    tail = next.catch(() => false);
    return next;
  };
}

type Field = { value: unknown; version: number; pending: boolean };
type Overlay = { scope: string; fields: Partial<Record<keyof BoardView, Field>> };

/**
 * The host-scoped board view preferences with safe writes. Several parts of the
 * plugin save different fields of the same document, so a save against a
 * stale revision is merged into the latest values and retried instead of being
 * dropped. Changes show immediately (optimistic) until the stored values agree.
 */
export function useBoardView(scope = "") {
  const settings = useSettings(boardViewSettings);
  const fresh = useRpc(readBoardView);
  const freshRead = useRef(fresh); freshRead.current = fresh;
  const latest = useRef(settings);
  latest.current = settings;
  const token = useMemo(() => ({}), [scope]);
  const owner = useRef(token); owner.current = token;
  const sequence = useRef(0);
  const write = useMemo(() => serialViewWriter(patch => saveMerged(() => latest.current, patch, wait, () => freshRead.current({}), () => owner.current === token)), [token]);
  const stored = settings.status === "ready" ? boardViewValues(settings.values) : null;
  const [overlay, setOverlay] = useState<Overlay>({ scope, fields: {} });
  // Drop optimistic fields once the stored document shows them.
  useEffect(() => {
    if (!stored) return;
    setOverlay((current) => {
      if (current.scope !== scope) return current;
      const left = Object.fromEntries(
        Object.entries(current.fields).filter(([key, field]) => field.pending || JSON.stringify(stored[key as keyof BoardView]) !== JSON.stringify(field.value)),
      );
      return Object.keys(left).length === Object.keys(current.fields).length ? current : { scope, fields: left };
    });
  }, [settings.status === "ready" ? settings.revision : "", overlay, scope]);
  const optimistic = overlay.scope === scope ? Object.fromEntries(Object.entries(overlay.fields).map(([key, field]) => [key, field.value])) : {};
  const values: BoardView | null = stored ? { ...stored, ...optimistic } : null;
  async function update(patch: Partial<BoardView>) {
    const version = ++sequence.current;
    setOverlay(current => ({ scope, fields: { ...(current.scope === scope ? current.fields : {}), ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, { value, version, pending: true }])) } }));
    const saved = await write(patch);
    setOverlay((current) => {
      if (current.scope !== scope) return current;
      const fields = { ...current.fields };
      Object.keys(patch).forEach(key => {
        const field = key as keyof BoardView;
        if (fields[field]?.version !== version) return;
        if (saved) fields[field] = { ...fields[field]!, pending: false };
        else delete fields[field];
      });
      return { scope, fields };
    });
    return saved;
  }
  return { ready: !!values, values, update, reload: settings.reload,
    problem: settings.status === "error" || settings.status === "invalid" ? settings.error : null };
}
