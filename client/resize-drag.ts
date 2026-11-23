type ResizeTarget = {
  width: number; maxWidth: number; enabled: boolean;
  onChange(width: number): void; onStart?(): void; onEnd?(): void;
};

/** One gesture owner: late moves after release, interruption or disposal are inert. */
export function createResizeDrag(read: () => ResizeTarget) {
  let origin: number | null = null;
  const change = (value: number) => {
    const target = read();
    if (target.enabled && Number.isFinite(value)) target.onChange(Math.max(340, Math.min(target.maxWidth, value)));
  };
  return {
    start() {
      if (!read().enabled || origin !== null) return;
      origin = read().width; read().onStart?.();
    },
    move(dx: number) { if (origin !== null) change(origin - dx); },
    end() {
      if (origin === null) return;
      origin = null; read().onEnd?.();
    },
    adjust(direction: 1 | -1) {
      if (!read().enabled || origin !== null) return;
      change(read().width + direction * 60); read().onEnd?.();
    },
  };
}
