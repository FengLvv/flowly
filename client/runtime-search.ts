import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { sessionSearch } from "../shared/rpc";
import { createRuntimeSearch, type SearchCandidate } from "./runtime-search-store";
import { useStableCallback } from "./stable";

const empty = { matches: new Set<string>(), pending: 0, errors: 0 };

export function useRuntimeSearch(candidates: readonly SearchCandidate[], enabled: boolean) {
  const read = useRpc(sessionSearch);
  const load = useStableCallback(read);
  const store = useMemo(() => createRuntimeSearch(load), [load]);
  const key = JSON.stringify(candidates);
  const configured = useRef("");
  useEffect(() => { store.setActive(enabled); return () => store.setActive(false); }, [store, enabled]);
  useEffect(() => {
    // Hiding behind chat pauses work without clearing completed matches or list geometry.
    if (configured.current === key) return;
    store.configure([]);
    if (!candidates.length) { configured.current = key; return; }
    if (!enabled) return;
    const timer = setTimeout(() => { configured.current = key; store.configure(candidates); }, 200);
    return () => clearTimeout(timer);
  }, [store, key, enabled]);
  useEffect(() => () => { store.setActive(false); store.configure([]); }, [store]);
  const snapshot = useSyncExternalStore(store.subscribe, store.read, store.read);
  // An effect has not yet applied this render's new query: never paint the old matches.
  return { ...(configured.current === key ? snapshot : empty), retry: store.retry };
}

