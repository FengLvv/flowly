import { useEffect, useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import { touch, useTheme } from "./ui";
import { t } from "../shared/i18n";
import { createResizeDrag } from "./resize-drag";

export const resizeGripWidth = touch ? 16 : 8;

export function ResizeGrip({
  width,
  onChange,
  maxWidth = 720,
  onStart,
  onEnd,
  enabled = true,
}: {
  width: number;
  onChange(width: number): void;
  maxWidth?: number;
  /** Drag began / finished (released or interrupted). */
  onStart?(): void;
  onEnd?(): void;
  enabled?: boolean;
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  const current = useRef({ width, maxWidth, enabled, onChange, onStart, onEnd });
  current.current = { width, maxWidth, enabled, onChange, onStart, onEnd };
  const [drag] = useState(() => createResizeDrag(() => current.current));
  useEffect(() => { if (!enabled) drag.end(); }, [enabled]);
  useEffect(() => () => drag.end(), []);
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => current.current.enabled,
      onPanResponderGrant: () => drag.start(),
      onPanResponderRelease: () => drag.end(),
      onPanResponderTerminate: () => drag.end(),
      onPanResponderMove: (_e, g) => drag.move(g.dx),
      onPanResponderTerminationRequest: () => false,
    }),
  );
  return (
    <View
      {...pan.panHandlers}
      accessibilityLabel={t("Drag to resize task details")}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 340, max: maxWidth, now: width }}
      accessibilityActions={[
        { name: "increment", label: t("Widen task details") },
        { name: "decrement", label: t("Narrow task details") },
      ]}
      onAccessibilityAction={(event) => {
        const name = event.nativeEvent.actionName;
        if (name === "increment" || name === "decrement") drag.adjust(name === "increment" ? 1 : -1);
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        width: resizeGripWidth,
        flexShrink: 0,
        alignItems: "center",
        cursor: "col-resize",
      } as never}
    >
      <View
        style={{
          flex: 1,
          width: hovered ? 2 : 1,
          backgroundColor: hovered ? colors.foregroundMuted : colors.border,
        }}
      />
    </View>
  );
}
