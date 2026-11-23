export type LaneWidth = { id: string; width: number };

/** Content coordinates come from ordered widths, never stale sibling x measurements. */
export function createLaneViewport(initial: readonly LaneWidth[], gap: number, inset: number) {
  let lanes = initial, viewport = 0, observedOffset = 0;
  const measured = new Map<string, number>();
  const listeners = new Set<() => void>();
  let visible: readonly string[] = [];
  const refresh = () => {
    const widths = lanes.map(lane => measured.get(lane.id) ?? lane.width);
    const content = inset * 2 + widths.reduce((sum, width) => sum + width, 0) + Math.max(0, lanes.length - 1) * gap;
    // A viewport/content resize may clamp native scroll without a new scroll event.
    observedOffset = Math.max(0, Math.min(observedOffset, Math.max(0, content - viewport)));
    let x = inset;
    const next: string[] = [];
    lanes.forEach((lane, index) => {
      const width = widths[index];
      if (viewport > 0 && x < observedOffset + viewport && x + width > observedOffset) next.push(lane.id);
      x += width + gap;
    });
    if (next.length === visible.length && next.every((id, i) => id === visible[i])) return;
    visible = next;
    listeners.forEach(listener => listener());
  };
  return {
    getSnapshot: () => visible,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    configure(next: readonly LaneWidth[]) {
      lanes = next;
      const ids = new Set(next.map(lane => lane.id));
      measured.forEach((_, id) => { if (!ids.has(id)) measured.delete(id); });
      refresh();
    },
    setViewportWidth(width: number) {
      if (!Number.isFinite(width) || width < 0 || viewport === width) return;
      viewport = width;
      refresh();
    },
    setLaneWidth(id: string, width: number) {
      if (!lanes.some(lane => lane.id === id) || !Number.isFinite(width) || width <= 0 || measured.get(id) === width) return;
      measured.set(id, width);
      refresh();
    },
    /** Only actual onScroll events enter here; an animated target is not an observation. */
    observeScroll(offset: number, width?: number) {
      if (!Number.isFinite(offset)) return;
      if (width !== undefined && Number.isFinite(width) && width > 0) viewport = width;
      observedOffset = Math.max(0, offset);
      refresh();
    },
  };
}
