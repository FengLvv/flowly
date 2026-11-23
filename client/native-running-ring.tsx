import { useEffect, useRef } from "react";
import { Animated, AppState, Easing, Platform, StyleSheet, View } from "react-native";
import { lerp, useReducedMotion } from "./motion";
import { useTheme } from "./ui";

/** Paseo StatusRing geometry/palette; the host currently exposes no public component. */
const size = 12, stroke = 1.5, period = 900;
const web = Platform.OS === "web" ? StyleSheet.create({
  spin: { animationKeyframes: { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
    animationDuration: `${period}ms`, animationTimingFunction: "linear", animationIterationCount: "infinite" } as object,
}).spin : null;

export function NativeRunningRing() {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const phase = useRef(new Animated.Value(0)).current;
  const semantic = (colors as typeof colors & { statusDotRunning?: string }).statusDotRunning;
  const hex = colors.surface0.replace("#", "");
  const rgb = hex.length === 3 ? hex.split("").map(c => parseInt(c + c, 16)) : [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  const dark = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 < 128;
  const color = semantic || (dark ? "#5caaf6" : "#268ae0");
  useEffect(() => {
    if (Platform.OS === "web" || reduced) return;
    let loop: Animated.CompositeAnimation | undefined;
    const restart = () => {
      loop?.stop(); phase.setValue(0);
      loop = Animated.loop(Animated.timing(phase, { toValue: 1, duration: period, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
      loop.start();
    };
    restart();
    const app = AppState.addEventListener("change", state => { if (state === "active") restart(); });
    return () => { app.remove(); loop?.stop(); phase.setValue(0); };
  }, [phase, reduced]);
  const circle = { width: size, height: size, borderRadius: size / 2, borderWidth: stroke };
  const arc = <View testID="flowly-running-arc" style={{ ...circle, borderColor: "transparent", borderTopColor: color, opacity: 0.9 }} />;
  return <View testID="flowly-running-ring" style={{ width: 14, height: 14, alignItems: "center", justifyContent: "center" }}>
    <View testID={reduced ? "flowly-running-static" : "flowly-running-track"} style={{ ...circle, position: "absolute", borderColor: color, opacity: 0.3 }} />
    {reduced ? arc : web ? <View testID="flowly-running-rotator" style={[{ position: "absolute", width: size, height: size }, web]}>{arc}</View>
      : <Animated.View testID="flowly-running-rotator" style={{ position: "absolute", width: size, height: size, transform: [{ rotate: lerp(phase, ["0deg", "360deg"]) }] }}>{arc}</Animated.View>}
    <View testID="flowly-running-center" style={{ position: "absolute", width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
  </View>;
}
