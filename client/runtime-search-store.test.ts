import { expect, test, vi } from "vitest";
import { createRuntimeSearch, type SearchCandidate } from "./runtime-search-store";
const c = (id: string, query = "word"): SearchCandidate => ({ id, workspaceId: "w", query, version: "v" });
const drain = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };

test("maximum two requests, stop scheduling while hidden, resume paging with bounded state", async () => {
  const page = deferred<{ matched: boolean; nextCursor: null }>();
  const load = vi.fn((_input: { agentId: string }) => page.promise), store = createRuntimeSearch(load);
  store.configure([c("a"), c("b"), c("c")]); store.setActive(true); await drain();
  expect(load).toHaveBeenCalledTimes(2); expect(load.mock.calls.map(([input]) => input.agentId)).toEqual(["a", "b"]); store.setActive(false);
  page.resolve({ matched: false, nextCursor: null }); await drain(); expect(load).toHaveBeenCalledTimes(2);
  store.setActive(true); await drain(); expect(load).toHaveBeenCalledTimes(3); expect(store.read().pending).toBe(0);
});
test("query/workspace changes and clearing discard late matches", async () => {
  const old = deferred<{ matched: boolean; nextCursor: null }>();
  const load = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue({ matched: false, nextCursor: null });
  const store = createRuntimeSearch(load); store.setActive(true); store.configure([c("a")]); await drain();
  store.configure([{ ...c("a", "next"), workspaceId: "moved" }]); await drain(); old.resolve({ matched: true, nextCursor: null }); await drain();
  expect([...store.read().matches]).toEqual([]); store.configure([]); expect(store.read()).toEqual({ matches: new Set(), pending: 0, errors: 0 });
});
test("pages to first match, retries errors and rejects cursor loops", async () => {
  const load = vi.fn().mockResolvedValueOnce({ matched: false, nextCursor: { epoch: "e", seq: 4 } }).mockResolvedValueOnce({ matched: false, nextCursor: { epoch: "e", seq: 4 } }).mockResolvedValueOnce({ matched: true, nextCursor: null });
  const store = createRuntimeSearch(load); store.setActive(true); store.configure([c("a")]); await drain();
  expect(store.read().errors).toBe(1); expect(store.read().pending).toBe(0); store.retry(); await drain();
  expect([...store.read().matches]).toEqual(["a"]); expect(load.mock.calls[2][0].cursor).toBeUndefined();
});
test("missing workspace is explicit failure, never an unscoped request", async () => {
  const load = vi.fn(), store = createRuntimeSearch(load); store.setActive(true);
  store.configure([{ ...c("a"), workspaceId: undefined }]); await drain();
  expect(store.read().errors).toBe(1); expect(load).not.toHaveBeenCalled();
});
