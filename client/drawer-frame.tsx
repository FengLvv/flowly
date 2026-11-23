import type { ReactNode } from "react";
import { Animated } from "react-native";
import { lerp } from "./motion";
import { ResizeGrip, resizeGripWidth } from "./resize";
import { useTheme } from "./ui";

/** Project details and Runtime conversations share exactly the same width/layout lifecycle. */
export function DrawerFrame({ testID, compact, width, maxWidth, resizing, active, settled, progress,
  onResize, onStartResize, onEndResize, children }: {
  testID: string; compact: boolean; width: number; maxWidth: number; resizing: boolean;
  active: boolean; settled: boolean; progress: Animated.Value; children: ReactNode;
  onResize(width: number): void; onStartResize(): void; onEndResize(): void;
}) {
  const { colors } = useTheme();
  return <Animated.View testID={testID} pointerEvents={active ? "auto" : "none"}
    accessibilityElementsHidden={!active} importantForAccessibility={active ? "auto" : "no-hide-descendants"}
    style={{
      ...(compact ? { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 30 } as const
        : resizing ? { position: "absolute", top: 0, bottom: 0, right: 0, width: width + resizeGripWidth, zIndex: 20 } as const
          : { width: width + resizeGripWidth }),
      minHeight: 0, flexShrink: 0, flexDirection: "row", backgroundColor: colors.surface0,
      ...(settled ? null : { opacity: progress, transform: [{ translateX: lerp(progress, [32, 0]) }] }),
    }}>
    {!compact && <ResizeGrip width={width} maxWidth={maxWidth} enabled={active}
      onStart={onStartResize} onEnd={onEndResize} onChange={onResize} />}
    {children}
  </Animated.View>;
}
