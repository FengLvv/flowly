import { useEffect, useRef, useState } from "react";
import { boardViewValues, type BoardView } from "../shared/settings";

const keys = ["runtimeCollapsed", "runtimeGroup", "runtimeSearch", "runtimeFullSearch", "runtimeHideSubagents", "runtimeRange", "runtimeSort", "runtimeProjectIds", "runtimeUnlinked"] as const;
export type RuntimePreferences = Pick<BoardView, typeof keys[number]>;
export function runtimePreferences(values: BoardView): RuntimePreferences {
  return Object.fromEntries(keys.map(key => [key, values[key]])) as RuntimePreferences;
}
const defaults = runtimePreferences(boardViewValues({}));
type View = { ready: boolean; values: BoardView | null; update(patch: Partial<BoardView>): Promise<boolean> };

/** Hydrate once per visit/host: background settings must not reseed a focused input. */
export function useRuntimePreferences(view: View, scope: string, onFailure: () => void) {
  const [state, setState] = useState<{ scope: string; ready: boolean; values: RuntimePreferences }>({ scope, ready: false, values: defaults });
  const current = useRef(state), latest = useRef({ view, scope, onFailure });
  const committed = useRef(defaults);
  latest.current = { view, scope, onFailure };
  const sequence = useRef(0), versions = useRef(new Map<string, number>());
  useEffect(() => {
    if (!view.values || current.current.scope === scope && current.current.ready) return;
    const next = { scope, ready: true, values: runtimePreferences(view.values) };
    committed.current = next.values; versions.current.clear();
    current.current = next; setState(next);
  }, [scope, view.ready]);
  function update(patch: Partial<RuntimePreferences>) {
    if (current.current.scope !== scope || !current.current.ready || !view.ready) return;
    const version = ++sequence.current;
    Object.keys(patch).forEach(key => versions.current.set(key, version));
    const next = { scope, ready: true, values: { ...current.current.values, ...patch } };
    current.current = next; setState(next);
    void view.update(patch).then(saved => {
      if (latest.current.scope !== scope) return;
      if (saved) { committed.current = { ...committed.current, ...patch }; return; }
      const fallback = committed.current;
      const undo = Object.fromEntries(Object.keys(patch).filter(key => versions.current.get(key) === version).map(key => [key, fallback[key as keyof RuntimePreferences]]));
      if (!Object.keys(undo).length) return;
      const reverted = { scope, ready: true, values: { ...current.current.values, ...undo } };
      current.current = reverted; setState(reverted); latest.current.onFailure();
    });
  }
  return { ready: state.scope === scope && state.ready, values: state.scope === scope ? state.values : defaults, update };
}
