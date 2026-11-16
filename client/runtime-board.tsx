import { memo, useEffect, useRef, useState, type ReactElement } from "react";
import { Pressable, View, type ScrollView as RNScrollView } from "react-native";
import { FlatList, ScrollView, Icon } from "@getpaseo/plugin/client/react-native";
import type { PaseoAgent } from "@getpaseo/client";
import { createBoardPan, hoveringBoardScrollbar } from "./board-pan";
import { type RuntimeGroup, type RuntimeLane } from "../shared/runtime-view";
import { msg, t } from "../shared/i18n";
import { BoardOutputActive } from "./query-activity";
import { Button, Label, font, noFocusRing, radius, space, useTheme } from "./ui";
import { columnWidth, columnGap } from "./geometry";

const names: Record<RuntimeLane, string> = {
  attention: msg("Needs attention"), running: msg("Running"), review: msg("To review"),
  idle: msg("Idle"), archived: msg("Archived"), unavailable: msg("Session state unavailable"),
};
const icons: Record<RuntimeLane, string> = {
  attention: "CircleAlert", running: "Loader", review: "CircleCheck", idle: "CirclePause", archived: "Archive", unavailable: "CircleHelp",
};

export function RuntimeTab({ active, onPress }: { active: boolean; onPress(): void }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="tab" accessibilityLabel={t("Runtime")} accessibilityState={{ selected: active }}
    {...({ "aria-selected": active } as object)} testID="runtime-tab" onPress={onPress}
    style={({ pressed }) => ({ ...noFocusRing, minHeight: 32, paddingHorizontal: space[2], borderRadius: radius.md,
      flexDirection: "row", alignItems: "center", gap: space[1.5], backgroundColor: active || pressed ? colors.surface2 : "transparent" })}>
    <Icon name="Activity" size={15} color={active ? colors.foreground : colors.foregroundMuted} />
    <Label selectable={false} size={font.md} medium muted={!active}>{t("Runtime")}</Label>
  </Pressable>;
}

/** Stays mounted behind the existing conversation sidebar, independent of the selected card's project. */
export const RuntimeBoard = memo(function RuntimeBoard({ groups, compact, active, stale, loading, onRetry, renderCard }: {
  groups: readonly RuntimeGroup[]; compact: boolean; active: boolean; stale: boolean; loading: boolean; onRetry(): void;
  renderCard(agent: PaseoAgent): ReactElement;
}) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<RuntimeLane>("attention");
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState([0]);
  const x = useRef(0), offsets = useRef(new Map<RuntimeLane, number>());
  const shown = groups.filter(g => !["unavailable", "archived"].includes(g.id) || g.sessions.length > 0);
  const frame = useRef<View>(null), scroll = useRef<RNScrollView>(null);
  const bounds = useRef({ x: 0, y: 0, width: 0, height: 0 }), content = useRef(0);
  const enabled = useRef(false); enabled.current = active && !compact;
  const [panning, setPanning] = useState(false), [barHovered, setBarHovered] = useState(false);
  const [pan] = useState(() => createBoardPan({
    metrics: () => ({ enabled: enabled.current, offset: x.current, viewport: bounds.current.width, content: content.current }),
    scrollTo: value => { x.current = value; scroll.current?.scrollTo({ x: value, animated: false }); }, active: setPanning,
  }));
  const { exclude, cancel, ...panHandlers } = pan;
  useEffect(() => { cancel(); }, [compact, active]);
  useEffect(() => () => cancel(), []);
  const chosen = shown.some(g => g.id === selected) ? selected : "attention";
  const updateVisible = (scroll: number, size: number) => {
    x.current = scroll;
    const next = shown.flatMap((_, i) => i * (columnWidth + columnGap) < scroll + size && (i + 1) * (columnWidth + columnGap) > scroll ? [i] : []);
    setVisible(old => old.join() === next.join() ? old : next);
  };
  const lane = (group: RuntimeGroup, index: number) => <View key={group.id} testID={`runtime-lane-${group.id}`}
    style={{ width: compact ? "100%" : columnWidth, flex: compact ? 1 : undefined, minHeight: 0,
      backgroundColor: colors.surface1, borderRadius: radius.xl, overflow: "hidden" }}>
    <View onPointerDown={exclude} style={{ minHeight: 40, paddingHorizontal: space[3], gap: space[2], flexDirection: "row", alignItems: "center" }}>
      <Icon name={icons[group.id]} size={15} color={group.id === "attention" ? colors.statusWarning : colors.foregroundMuted} />
      <View style={{ flex: 1 }}><Label medium selectable={false}>{t(names[group.id])}</Label></View>
      <Label muted selectable={false}>{group.sessions.length}</Label>
    </View>
    {(compact || visible.includes(index)) && <BoardOutputActive.Provider value={active && (compact || visible.includes(index))}>
      <FlatList key={group.id} data={group.sessions} keyExtractor={(agent: PaseoAgent) => agent.id}
        renderItem={({ item }: { item: PaseoAgent }) => <View onPointerDown={exclude}>{renderCard(item)}</View>}
        contentOffset={{ x: 0, y: offsets.current.get(group.id) || 0 }}
        onScroll={(e) => offsets.current.set(group.id, e.nativeEvent.contentOffset.y)} scrollEventThrottle={64}
        style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ padding: space[2], paddingBottom: 72, gap: space[2] }}
        initialNumToRender={8} maxToRenderPerBatch={6} windowSize={7} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<View style={{ padding: space[4] }}><Label muted selectable={false}>{t("No sessions")}</Label></View>} />
    </BoardOutputActive.Provider>}
  </View>;
  return <View testID="runtime-board" style={{ flex: 1, minHeight: 0 }}>
    {loading && <View style={{ padding: space[3] }}><Label muted>{t("Loading sessions…")}</Label></View>}
    {stale && <View style={{ paddingHorizontal: space[3], paddingVertical: space[1] }}><Label muted>{t("Last known")}</Label><Button quiet onPress={onRetry}>{t("Retry")}</Button></View>}
    {compact ? <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ padding: space[2], gap: space[1] }}>
        {shown.map(group => <Pressable key={group.id} testID={`runtime-group-${group.id}`} accessibilityRole="tab"
          accessibilityLabel={t(names[group.id])} accessibilityState={{ selected: chosen === group.id }}
          {...({ "aria-selected": chosen === group.id } as object)} onPointerDown={exclude} onPress={() => setSelected(group.id)}
          style={{ ...noFocusRing, padding: space[2], borderRadius: radius.md, backgroundColor: chosen === group.id ? colors.surface2 : "transparent" }}>
          <Label selectable={false} size={font.sm}>{t(names[group.id])} {group.sessions.length}</Label>
        </Pressable>)}
      </ScrollView>
      {shown.filter(g => g.id === chosen).map(g => lane(g, 0))}
    </> : <View ref={frame} testID="runtime-pan" {...panHandlers}
      onPointerMove={event => { pan.onPointerMove(event); setBarHovered(hoveringBoardScrollbar(event.nativeEvent, bounds.current)); }}
      onPointerLeave={() => { cancel(); setBarHovered(false); }}
      onLayout={() => { cancel(); frame.current?.measureInWindow((bx, by, bw, bh) => { bounds.current = { x: bx, y: by, width: bw, height: bh }; setWidth(bw); updateVisible(x.current, bw); }); }}
      style={{ flex: 1, minHeight: 0, overflow: "hidden", ...(panning ? { cursor: "grabbing" } as object : {}) }}>
      <ScrollView ref={scroll} horizontal nestedScrollEnabled showsHorizontalScrollIndicator={barHovered && !panning}
      onContentSizeChange={size => { content.current = size; }}
      onScroll={e => updateVisible(e.nativeEvent.contentOffset.x, width)} scrollEventThrottle={64}
      style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ padding: space[3], gap: columnGap, flexDirection: "row" }}>
      {shown.map(lane)}
    </ScrollView></View>}
  </View>;
});
