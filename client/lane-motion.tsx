import { memo, useContext, type ReactNode } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import { lerp, marqueePeriod, useHeightMotionBusy, useMarquee, useReducedMotion } from "./motion";
import { BoardOutputActive } from "./query-activity";

export type IconMotion = "spin" | "breathe";
// Same RN-web keyframe path as RunningDots: no per-frame JS/React work.
const web = Platform.OS === "web" ? StyleSheet.create({
  spin: { animationKeyframes: { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
    animationDuration: `${marqueePeriod}ms`, animationTimingFunction: "linear", animationIterationCount: "infinite" } as object,
  breathe: { animationKeyframes: { "0%": { opacity: 1 }, "50%": { opacity: 0.5 }, "100%": { opacity: 1 } },
    animationDuration: `${marqueePeriod}ms`, animationTimingFunction: "ease-in-out", animationIterationCount: "infinite" } as object,
}) : null;

/** Only wraps the existing glyph; idle/reduced/hidden states carry no animated props. */
export const LaneIconMotion = memo(function LaneIconMotion({ active, kind = "breathe", size = 16, testID, children }: {
  active: boolean; kind?: IconMotion; size?: number; testID?: string; children: ReactNode;
}) {
  const reduced = useReducedMotion(), held = useHeightMotionBusy();
  const visible = useContext(BoardOutputActive);
  const moving = active && visible && !reduced && !held;
  const phase = useMarquee(moving && Platform.OS !== "web");
  const frame = { width: size, height: size, alignItems: "center", justifyContent: "center", flexShrink: 0 } as const;
  if (!moving) return <View testID={testID} style={frame}>{children}</View>;
  if (web) return <View testID={testID} style={[frame, web[kind]]}>{children}</View>;
  return <Animated.View testID={testID} style={[frame, phase ? kind === "spin"
    ? { transform: [{ rotate: lerp(phase, ["0deg", "360deg"]) }] }
    : { opacity: lerp(phase, [1, 0.5, 1], [0, 0.5, 1]) } : null]}>{children}</Animated.View>;
});
