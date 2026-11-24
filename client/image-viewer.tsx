import { useEffect, useRef, useState } from "react";
import { Image, PanResponder, Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { t } from "../shared/i18n";
import { copyImage } from "./image-clipboard";
import { boundView, fitImage, fitView, maxZoom, zoomImage, type ImageView } from "./image-viewer-geometry";
import { Modal } from "./modal";
import { Enter } from "./motion";
import { Label, font, noFocusRing, radius, space, useTheme } from "./ui";

const web = Platform.OS === "web";
const step = 1.25;
const menuWidth = 180;
const menuHeight = 40;
const empty = { width: 0, height: 0 };
type Point = { x: number; y: number };
type PointerEvent = {
  nativeEvent: { button: number; buttons: number; pointerId: number; pointerType: string; pageX: number; pageY: number };
  preventDefault(): void;
};
type ContextEvent = {
  nativeEvent: { offsetX: number; offsetY: number };
  preventDefault(): void;
  stopPropagation(): void;
};
type WheelEvent = {
  nativeEvent: { deltaY: number; deltaMode: number; offsetX: number; offsetY: number; ctrlKey: boolean; metaKey: boolean };
  stopPropagation(): void;
};
const focusState = (state: { pressed: boolean }) => state as { pressed: boolean; hovered?: boolean; focused?: boolean };

export function ImageViewer({ uri, name, open, onClose }: { uri: string; name: string; open: boolean; onClose(): void }) {
  const [menu, setMenu] = useState<Point | null>(null);
  return (
    <Modal open={open} title={name} onOpenChange={(next) => {
      if (next) return;
      if (menu) setMenu(null);
      else onClose();
    }}>
      <Modal.Content scrollable={false} contentContainerStyle={styles.body}>
        <ImageViewport uri={uri} name={name} menu={menu} setMenu={setMenu} />
      </Modal.Content>
    </Modal>
  );
}

function ImageViewport({ uri, name, menu, setMenu }: {
  uri: string; name: string; menu: Point | null; setMenu(menu: Point | null): void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const [viewport, setViewport] = useState(empty);
  const [source, setSource] = useState(empty);
  const [error, setError] = useState(false);
  const [view, setView] = useState(fitView);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<(Point & { pointerId: number }) | null>(null);
  const menuAction = useRef<View>(null);
  const copyAction = useRef<View>(null);
  const copying = useRef(false);
  const restoreFocus = useRef(false);
  const fitted = source.width > 0 && source.height > 0 && fitImage(source, viewport);
  const ready = !!fitted && viewport.width > 0 && viewport.height > 0 && !error;
  const frame = fitted ? boundView(view, fitted, viewport) : fitView;
  const canPan = ready && view.zoom > 1 &&
    (fitted.width * view.zoom > viewport.width || fitted.height * view.zoom > viewport.height);

  useEffect(() => {
    let active = true;
    Image.getSize(uri, (width, height) => {
      if (active) setSource({ width, height });
    }, () => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [uri]);

  useEffect(() => {
    if (menu) {
      restoreFocus.current = true;
      menuAction.current?.focus();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      copyAction.current?.focus();
    }
  }, [menu]);

  const resize = (size: typeof viewport) => {
    setViewport(size);
    if (source.width > 0 && source.height > 0) {
      setView((current) => boundView(current, fitImage(source, size), size));
    }
    setMenu(null);
  };
  const zoom = (multiplier: number, anchor: Point = { x: 0, y: 0 }) => {
    if (ready) setView((current) => zoomImage(current, multiplier, anchor, fitted, viewport));
  };
  const pan = (x: number, y: number) => {
    if (ready) setView((current) => {
      const bounded = boundView(current, fitted, viewport);
      return boundView({ ...bounded, x: bounded.x + x, y: bounded.y + y }, fitted, viewport);
    });
  };
  // Keep one native responder and call through to the current layout bounds.
  const touch = useRef({ canPan, pan });
  touch.current = { canPan, pan };
  const [nativeDrag] = useState(() => web ? null : PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dx, dy }) => touch.current.canPan && Math.hypot(dx, dy) >= 4,
    onPanResponderMove: (event) => {
      const { pageX, pageY } = event.nativeEvent;
      const previous = drag.current;
      drag.current = { x: pageX, y: pageY, pointerId: 0 };
      if (previous) touch.current.pan(pageX - previous.x, pageY - previous.y);
    },
    onPanResponderRelease: () => { drag.current = null; },
    onPanResponderTerminate: () => { drag.current = null; },
  }));

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };
  const showMenu = (event: ContextEvent) => {
    event.preventDefault();
    event.stopPropagation();
    endDrag();
    if (ready) setMenu({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY });
  };
  const webEvents = {
    onWheel: (event: WheelEvent) => {
      const { deltaY, deltaMode, offsetX, offsetY, ctrlKey, metaKey } = event.nativeEvent;
      if (ctrlKey || metaKey || menu || !deltaY) return;
      event.stopPropagation();
      const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? viewport.height : 1);
      const speed = Math.max(-1, Math.min(1, pixels / 600));
      zoom(Math.exp(-speed), { x: offsetX - viewport.width / 2, y: offsetY - viewport.height / 2 });
    },
    onPointerDown: (event: PointerEvent) => {
      const { button, pageX, pageY, pointerId } = event.nativeEvent;
      if (!canPan || menu || button !== 0) return;
      event.preventDefault();
      drag.current = { x: pageX, y: pageY, pointerId };
      setDragging(true);
    },
    onPointerMove: (event: PointerEvent) => {
      const { buttons, pointerType, pageX, pageY, pointerId } = event.nativeEvent;
      const previous = drag.current;
      if (!previous || previous.pointerId !== pointerId) return;
      if (!canPan || (pointerType === "mouse" && !(buttons & 1))) return endDrag();
      pan(pageX - previous.x, pageY - previous.y);
      drag.current = { x: pageX, y: pageY, pointerId };
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onPointerLeave: () => {
      endDrag();
      if (menu) setMenu(null);
    },
    onContextMenu: showMenu,
  };
  const copy = async () => {
    setMenu(null);
    if (copying.current) return;
    copying.current = true;
    try {
      await copyImage(uri);
      toast.show(t("Image copied"), { variant: "success" });
    } catch {
      toast.error(t("Could not copy image."));
    } finally {
      copying.current = false;
    }
  };
  const size = fitted
    ? { width: fitted.width, height: fitted.height }
    : { width: "100%" as const, height: "100%" as const };
  const menuLeft = menu ? Math.max(0, Math.min(menu.x, viewport.width - menuWidth - 4)) : 0;
  const menuTop = menu ? Math.max(0, Math.min(menu.y, viewport.height - menuHeight - 4)) : 0;

  return <>
    <View
      testID="image-viewer-viewport"
      onLayout={({ nativeEvent: { layout: { width, height } } }) => resize({ width, height })}
      {...(web ? webEvents : nativeDrag?.panHandlers) as object}
      style={[styles.viewport, { backgroundColor: colors.surface1 }, web && ({
        cursor: dragging ? "grabbing" : canPan ? "grab" : "default",
        touchAction: "none",
      } as unknown as ViewStyle)]}
    >
      <View pointerEvents="none" style={styles.imageLayer}>
        {error ? <Label muted>{t("Could not open image.")}</Label> : (
          <Image
            source={{ uri }}
            accessibilityLabel={name}
            resizeMode="contain"
            onError={() => setError(true)}
            style={[size, { transform: [{ translateX: frame.x }, { translateY: frame.y }, { scale: frame.zoom }] }]}
          />
        )}
      </View>
      {menu && <>
        <Pressable accessible={false} focusable={false} style={[StyleSheet.absoluteFill, noFocusRing]} onPress={() => setMenu(null)} />
        <Enter distance={0} style={{
          position: "absolute", left: menuLeft, top: menuTop, width: Math.min(menuWidth, viewport.width),
        }}>
          <View accessibilityRole="menu" style={{
            padding: 3, borderWidth: 1, borderColor: colors.border,
            borderRadius: radius.md, backgroundColor: colors.surface0,
          }}>
            <Pressable
              ref={menuAction}
              accessibilityRole="menuitem"
              accessibilityLabel={t("Copy image")}
              onPress={copy}
              style={(state) => {
                const { pressed, hovered, focused } = focusState(state);
                return {
                  ...noFocusRing,
                  height: 32, paddingHorizontal: space[2], gap: space[2], flexDirection: "row", alignItems: "center",
                  borderRadius: radius.md, backgroundColor: pressed || hovered || focused ? colors.surface2 : colors.surface0,
                };
              }}
            >
              <Icon name="Copy" size={15} color={colors.foregroundMuted} />
              <Label lines={1} selectable={false}>{t("Copy image")}</Label>
            </Pressable>
          </View>
        </Enter>
      </>}
    </View>
    <View style={[styles.toolbar, { borderTopColor: colors.border, backgroundColor: colors.surface0 }]}>
      <ViewerButton label={t("Zoom out")} icon="Minus" disabled={!ready || frame.zoom <= 1} onPress={() => { setMenu(null); zoom(1 / step); }} />
      <ViewerButton label={t("Fit to window")} icon="Maximize" text={`${Math.round(frame.zoom * 100)}%`} disabled={!ready} onPress={() => { setMenu(null); setView(fitView); }} />
      <ViewerButton label={t("Zoom in")} icon="Plus" disabled={!ready || frame.zoom >= maxZoom} onPress={() => { setMenu(null); zoom(step); }} />
      {web && <ViewerButton buttonRef={copyAction} label={t("Copy image")} icon="Copy" disabled={!ready} onPress={copy} />}
    </View>
  </>;
}

function ViewerButton({ buttonRef, label, icon, text, disabled, onPress }: {
  buttonRef?: React.Ref<View>; label: string; icon?: string; text?: string; disabled: boolean; onPress(): void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      ref={buttonRef}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={text ? { text } : undefined}
      disabled={disabled}
      onPress={onPress}
      style={(state) => ({
        ...noFocusRing,
        height: web ? 34 : 44, minWidth: web ? 34 : 44, paddingHorizontal: text ? space[2] : 0,
        flexDirection: "row", gap: space[1.5],
        alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1,
        borderColor: focusState(state).focused ? colors.accent : "transparent",
        backgroundColor: state.pressed || focusState(state).hovered ? colors.surface2 : "transparent",
        opacity: disabled ? 0.45 : 1,
      })}
    >
      {icon && <Icon name={icon} size={text ? 15 : 18} color={colors.foreground} />}
      {text && <Label size={font.sm} selectable={false}>{text}</Label>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, minHeight: 0, padding: 0, gap: 0 },
  viewport: { flex: 1, minHeight: 0, overflow: "hidden" },
  imageLayer: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  toolbar: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: space[1], paddingVertical: space[1], borderTopWidth: StyleSheet.hairlineWidth,
  },
});
