import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Image, Modal as RNModal, PanResponder, Platform, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { t } from "../shared/i18n";
import { copyImage } from "./image-clipboard";
import { boundView, fitImage, fitView, imageViewerSize, maxZoom, zoomImage, type ImageView, type Size } from "./image-viewer-geometry";
import { Modal, useInsideModal } from "./modal";
import { Enter, useReducedMotion } from "./motion";
import { useShortcutBlock } from "./shortcuts";
import { Label, font, noFocusRing, radius, space, useTheme } from "./ui";

const web = Platform.OS === "web";
const step = 1.25;
const menuWidth = 180;
const menuHeight = 40;
const titleHeight = 48;
const toolbarHeight = 44;
const border = 1;
const fallbackAspect = { width: 4, height: 3 };
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

const WebViewerContext = createContext<((uri: string, name: string) => void) | null>(null);

/** Keep the viewer open when the board remounts the drawer at a layout breakpoint. */
export function WebImageViewerProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<{ uri: string; name: string; open: boolean; version: number } | null>(null);
  const sequence = useRef(0);
  const show = useCallback((uri: string, name: string) => {
    setPreview({ uri, name, open: true, version: ++sequence.current });
  }, []);
  const close = () => setPreview((current) => current && { ...current, open: false });
  const clear = (version: number) => setPreview((current) =>
    current?.version === version && !current.open ? null : current);
  return (
    <WebViewerContext.Provider value={web ? show : null}>
      {children}
      {preview && <ImageViewer key={preview.version} {...preview} onClose={close} onDismiss={() => clear(preview.version)} />}
    </WebViewerContext.Provider>
  );
}

export function ImagePreviewTrigger({ uri, name, style, children }: {
  uri: string | undefined; name: string; style?: StyleProp<ViewStyle>; children: ReactNode;
}) {
  const show = useContext(WebViewerContext);
  const nested = useInsideModal();
  const [preview, setPreview] = useState({ open: false, version: 0 });
  const open = () => {
    if (!uri) return;
    if (show && !nested) show(uri, name);
    else setPreview(({ version }) => ({ open: true, version: version + 1 }));
  };
  return <>
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={t("{alt}. Open larger", { alt: name })}
      onPress={open}
      style={[noFocusRing, style]}
    >
      {children}
    </Pressable>
    {uri && preview.version > 0 && <ImageViewer
      key={preview.version} uri={uri} name={name} open={preview.open}
      onClose={() => setPreview((current) => ({ ...current, open: false }))}
    />}
  </>;
}

function ImageViewer({ uri, name, open, onClose, onDismiss }: {
  uri: string; name: string; open: boolean; onClose(): void; onDismiss?(): void;
}) {
  const inModal = useInsideModal();
  const standalone = web && !inModal;
  useShortcutBlock(open && standalone);
  const window = useWindowDimensions();
  const [source, setSource] = useState<Size | null>(null);
  const [error, setError] = useState(false);
  const [menu, setMenu] = useState<Point | null>(null);
  useEffect(() => {
    if (!open) return;
    let active = true;
    Image.getSize(uri, (width, height) => {
      if (!active) return;
      if (width > 0 && height > 0) setSource({ width, height });
      else setError(true);
    }, () => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [open, uri]);

  const dismiss = () => {
    if (menu) setMenu(null);
    else onClose();
  };
  const viewportProps = { uri, name, source, error, onError: () => setError(true), menu, setMenu };
  if (standalone) {
    const size = imageViewerSize(source ?? fallbackAspect,
      { width: window.width - border * 2, height: window.height - border * 2 }, titleHeight + toolbarHeight);
    return <DesktopViewer size={size} name={name} open={open} onClose={onClose} onDismiss={onDismiss} dismiss={dismiss} viewportProps={viewportProps} />;
  }
  // Keep the host's focus stack for nested forms and its native mobile sheet.
  // On web, let the nested dialog shrink vertically to the bitmap.
  const nested = web ? fitImage(source ?? fallbackAspect, {
    width: Math.max(1, Math.min(520, window.width - 48) - border * 2),
    height: Math.max(1, (window.height - 48) * 0.85 - 66 - toolbarHeight),
  }) : null;
  return (
    <Modal open={open} title={name} onOpenChange={(next) => { if (!next) dismiss(); }}>
      <Modal.Content scrollable={!!nested} contentContainerStyle={[styles.body, !nested && styles.fillBody]}>
        {nested ? <View style={{ height: nested.height + toolbarHeight }}>
          <ImageViewport {...viewportProps} />
        </View> : <ImageViewport {...viewportProps} />}
      </Modal.Content>
    </Modal>
  );
}

type ViewportProps = {
  uri: string; name: string; source: Size | null; error: boolean; onError(): void;
  menu: Point | null; setMenu(menu: Point | null): void;
  onCopyFeedback?(success: boolean): void;
};

function DesktopViewer({ size, name, open, onClose, onDismiss, dismiss, viewportProps }: {
  size: Size; name: string; open: boolean; onClose(): void; onDismiss?(): void; dismiss(): void; viewportProps: ViewportProps;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [feedback, setFeedback] = useState<{ success: boolean } | null>(null);
  useEffect(() => {
    if (!feedback || !open) return;
    const timer = setTimeout(() => setFeedback(null), 2000);
    return () => clearTimeout(timer);
  }, [feedback, open]);
  return (
    <RNModal visible={open} transparent accessibilityLabel={name} animationType={reduced ? "none" : "fade"} onRequestClose={dismiss} onDismiss={onDismiss}>
      <View style={styles.desktopOverlay}>
        <Pressable
          accessible={false} focusable={false} onPress={dismiss}
          style={[StyleSheet.absoluteFillObject, noFocusRing, { backgroundColor: "rgba(0,0,0,0.55)" }]}
        />
        <View
          testID="image-viewer-frame"
          style={[styles.desktopFrame, {
            width: Math.min(width, Math.max(192, size.width + border * 2)),
            height: titleHeight + size.height + toolbarHeight + border * 2,
            borderColor: colors.border, backgroundColor: colors.surface0,
          }]}
        >
          <View style={[styles.titleBar, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Label lines={1} medium selectable={false}>{name}</Label>
            </View>
            <ViewerButton icon="X" label={t("Close")} onPress={onClose} disabled={false} />
          </View>
          <ImageViewport {...viewportProps} onCopyFeedback={(success) => setFeedback({ success })} />
          {/* Host toasts are drawn below the web Modal portal. Mirror the
              feedback above the toolbar while this viewer covers the app. */}
          {feedback && <View pointerEvents="none" style={styles.feedback}>
            <View accessibilityLiveRegion="polite" style={[styles.feedbackLabel, { backgroundColor: colors.surface0, borderColor: colors.border }]}>
              <Label size={font.sm}>{feedback.success ? t("Image copied") : t("Could not copy image.")}</Label>
            </View>
          </View>}
        </View>
      </View>
    </RNModal>
  );
}

function ImageViewport({ uri, name, source, error, onError, menu, setMenu, onCopyFeedback }: ViewportProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const [viewport, setViewport] = useState(empty);
  const [view, setView] = useState(fitView);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<(Point & { pointerId: number }) | null>(null);
  const menuAction = useRef<View>(null);
  const copyAction = useRef<View>(null);
  const copying = useRef(false);
  const restoreFocus = useRef(false);
  const fitted = source && fitImage(source, viewport);
  const ready = !!fitted && viewport.width > 0 && viewport.height > 0 && !error;
  const frame = fitted ? boundView(view, fitted, viewport) : fitView;
  const canPan = ready && view.zoom > 1 &&
    (fitted.width * view.zoom > viewport.width || fitted.height * view.zoom > viewport.height);

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
    if (source) {
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
      onCopyFeedback?.(true);
    } catch {
      toast.error(t("Could not copy image."));
      onCopyFeedback?.(false);
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
            onError={onError}
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
  body: { padding: 0, gap: 0 },
  fillBody: { flex: 1, minHeight: 0 },
  desktopOverlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  desktopFrame: { borderWidth: border, borderRadius: radius.xl, overflow: "hidden" },
  titleBar: {
    height: titleHeight, flexDirection: "row", alignItems: "center", gap: space[2],
    paddingLeft: space[4], paddingRight: space[2], borderBottomWidth: StyleSheet.hairlineWidth,
  },
  viewport: { flex: 1, minHeight: 0, overflow: "hidden" },
  imageLayer: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  toolbar: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: space[1], height: web ? toolbarHeight : 52, borderTopWidth: StyleSheet.hairlineWidth,
  },
  feedback: { position: "absolute", bottom: toolbarHeight + space[2], left: 0, right: 0, alignItems: "center" },
  feedbackLabel: { borderWidth: border, paddingHorizontal: space[2], paddingVertical: space[1], borderRadius: radius.md },
});
