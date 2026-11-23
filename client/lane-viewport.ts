import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createLaneViewport, type LaneWidth } from "./lane-viewport-store";
import { columnGap } from "./geometry";

/** One visibility lifecycle for both boards; no async window measurement or per-scroll React state. */
export function useLaneViewport(lanes: readonly LaneWidth[], inset = 12) {
  const [store] = useState(() => createLaneViewport(lanes, columnGap, inset));
  const layoutKey = JSON.stringify(lanes);
  useLayoutEffect(() => { store.configure(lanes); }, [store, layoutKey]);
  const visible = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...store, visible };
}
