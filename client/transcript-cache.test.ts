import { afterEach, expect, test, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { INACTIVE_TRANSCRIPTS, INACTIVE_TRANSCRIPT_TEXT, RETAINED_TRANSCRIPT_GC, retainTranscript, trimTranscripts } from "./transcript-cache";
import type { TimelineWindow } from "../shared/session-tail";

const clients: QueryClient[] = [];
const client = () => { const c = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 300_000 } } }); clients.push(c); return c; };
const key = (id: string, scope = "task") => ["flowly", "transcript", scope, id];
const window = (text = "cached"): TimelineWindow => ({ epoch: "e", entries: [{ seqStart: 1, item: { type: "agent_message", text } }], startCursor: { epoch: "e", seq: 1 }, hasOlder: false });
function open(c: QueryClient, id: string, text = "cached") {
  const queryKey = key(id);
  c.setQueryData(queryKey, window(text));
  const observer = new QueryObserver(c, { queryKey, queryFn: async () => window(text), enabled: false, gcTime: RETAINED_TRANSCRIPT_GC });
  const stop = observer.subscribe(() => {});
  const release = retainTranscript(c, queryKey);
  return async () => { stop(); observer.destroy(); release(); await Promise.resolve(); };
}
afterEach(() => { clients.splice(0).forEach(c => c.clear()); vi.useRealTimers(); });

test("retained output survives default GC and is available while a fresh read is pending", async () => {
  vi.useFakeTimers();
  const c = client();
  await open(c, "old")();
  c.setQueryData(["unrelated"], "normal lifetime");
  await vi.advanceTimersByTimeAsync(6 * 60_000);
  expect(c.getQueryData(key("old"))).toEqual(window());
  expect(c.getQueryData(["unrelated"])).toBeUndefined();
  let finish!: (value: TimelineWindow) => void;
  const observer = new QueryObserver(c, { queryKey: key("old"), gcTime: RETAINED_TRANSCRIPT_GC, queryFn: () => new Promise<TimelineWindow>(resolve => { finish = resolve; }) });
  const stop = observer.subscribe(() => {}), release = retainTranscript(c, key("old"));
  expect(observer.getCurrentResult().isFetching).toBe(true);
  expect(observer.getCurrentResult().data).toEqual(window());
  finish(window("fresh"));
  await vi.advanceTimersByTimeAsync(0);
  expect(observer.getCurrentResult().data).toEqual(window("fresh"));
  stop(); observer.destroy(); release();
});

test("evicts least recently opened inactive windows, preserving revisited and unrelated queries", async () => {
  const c = client();
  c.setQueryData(["flowly", "board"], "keep");
  for (let i = 0; i < INACTIVE_TRANSCRIPTS; i++) await open(c, String(i))();
  await open(c, "0")();
  await open(c, "new")();
  expect(c.getQueryData(key("1"))).toBeUndefined();
  expect(c.getQueryData(key("0"))).toBeDefined();
  expect(c.getQueryData(key("new"))).toBeDefined();
  expect(c.getQueryData(["flowly", "board"])).toBe("keep");
  expect(c.getQueryCache().findAll({ queryKey: ["flowly", "transcript"] })).toHaveLength(INACTIVE_TRANSCRIPTS);
});

test("text budget applies to inactive snapshots and never evicts an observed transcript", async () => {
  const c = client();
  const closeActive = open(c, "active", "x".repeat(INACTIVE_TRANSCRIPT_TEXT + 1));
  await open(c, "older", "x".repeat(600_000))();
  await open(c, "newer", "x".repeat(600_000))();
  expect(c.getQueryData(key("active"))).toBeDefined();
  expect(c.getQueryData(key("older"))).toBeUndefined();
  expect(c.getQueryData(key("newer"))).toBeDefined();
  await closeActive();
  expect(c.getQueryData(key("active"))).toBeUndefined();
});

test("adopts old-bundle windows and keeps scoped keys independent", async () => {
  const c = client();
  for (let i = 0; i <= INACTIVE_TRANSCRIPTS; i++) c.setQueryData(key(String(i)), window());
  const release = retainTranscript(c, key("12"));
  release();
  await Promise.resolve();
  trimTranscripts(c);
  expect(c.getQueryCache().findAll({ queryKey: ["flowly", "transcript"] })).toHaveLength(INACTIVE_TRANSCRIPTS);
  const one = key("same", "task:a"), two = key("same", "workspace:b");
  c.setQueryData(one, window("one")); c.setQueryData(two, window("two"));
  retainTranscript(c, one); retainTranscript(c, two);
  expect(c.getQueryData(one)).toEqual(window("one"));
  expect(c.getQueryData(two)).toEqual(window("two"));
  release();
});

test("a window opening before observer subscription is protected until release", async () => {
  const c = client(), queryKey = key("opening");
  c.setQueryData(queryKey, window("x".repeat(INACTIVE_TRANSCRIPT_TEXT + 1)));
  const release = retainTranscript(c, queryKey);
  expect(c.getQueryData(queryKey)).toBeDefined();
  release();
  await Promise.resolve();
  expect(c.getQueryData(queryKey)).toBeUndefined();
});
