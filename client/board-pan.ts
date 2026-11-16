/** Local pointer state for blank-area panning. No DOM, timers or persistent state. */
type Pointer = {
  nativeEvent: { pointerType?: string; button?: number; buttons?: number; pointerId?: number; pageX: number };
  preventDefault?(): void;
  stopPropagation?(): void;
};
type MenuEvent = { preventDefault?(): void; stopPropagation?(): void };

/** A bottom-edge hot zone reveals the native scrollbar without covering its hit target. */
export function hoveringBoardScrollbar(pointer: { pointerType?: string; pageX: number; pageY: number }, frame: { x: number; y: number; width: number; height: number }) {
  return pointer.pointerType === "mouse" && pointer.pageX >= frame.x && pointer.pageX <= frame.x + frame.width && pointer.pageY >= frame.y + Math.max(0, frame.height - 16) && pointer.pageY <= frame.y + frame.height;
}

/** Exclude an entire interactive subtree, while leaving its own pointer/menu handlers intact. */
export function excludeBoardPan(event: Pointer) {
  if (event.nativeEvent.button === 2) event.stopPropagation?.();
}

export function createBoardPan(options: {
  metrics(): { enabled: boolean; offset: number; viewport: number; content: number };
  scrollTo(x: number): void;
  active(value: boolean): void;
}) {
  let press: { id?: number; x: number } | null = null;
  let suppressMenu = false;
  const cancel = () => {
    if (!press) return;
    press = null;
    options.active(false);
  };
  return {
    cancel,
    // RN-web does not forward pointer capture handlers. Excluded subtrees
    // explicitly reset the menu latch before stopping the bubbling press.
    exclude(event: Pointer) {
      cancel();
      suppressMenu = false;
      excludeBoardPan(event);
    },
    onPointerDown(event: Pointer) {
      cancel();
      suppressMenu = false;
      const n = event.nativeEvent;
      const m = options.metrics();
      if (!m.enabled || n.pointerType !== "mouse" || n.button !== 2 || n.buttons !== 2 || m.content <= m.viewport || m.viewport <= 0) return;
      press = { id: n.pointerId, x: n.pageX };
      suppressMenu = true;
      event.preventDefault?.();
      options.active(true);
    },
    onPointerMove(event: Pointer) {
      const n = event.nativeEvent;
      if (!press || n.pointerId !== press.id) return;
      const m = options.metrics();
      if (!m.enabled || n.buttons !== 2) return cancel();
      const x = Math.max(0, Math.min(Math.max(0, m.content - m.viewport), m.offset + press.x - n.pageX));
      press.x = n.pageX;
      event.preventDefault?.();
      if (x !== m.offset) options.scrollTo(x);
    },
    onPointerUp(event: Pointer) {
      if (event.nativeEvent.pointerId === press?.id) cancel();
    },
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onBlur: cancel,
    onContextMenu(event: MenuEvent) {
      if (!suppressMenu) return false;
      event.preventDefault?.();
      event.stopPropagation?.();
      return true;
    },
  };
}
