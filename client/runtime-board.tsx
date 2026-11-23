import { memo, useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Animated, Pressable, View, type ScrollView as RNScrollView } from "react-native";
import { FlatList, ScrollView, Icon } from "@getpaseo/plugin/client/react-native";
import type { PaseoAgent } from "@getpaseo/client";
import { createBoardPan, hoveringBoardScrollbar } from "./board-pan";
import { type RuntimeGroup, type RuntimeLane } from "../shared/runtime-view";
import { msg, t } from "../shared/i18n";
import { BoardOutputActive } from "./query-activity";
import { Button, IconButton, Label, font, noFocusRing, radius, space, touch, useTheme } from "./ui";
import { columnWidth, columnGap } from "./geometry";
import { Enter, lerp, motionDuration, useMotionValue } from "./motion";
import { LaneIconMotion } from "./lane-motion";
import { useLaneViewport } from "./lane-viewport";

const collapsedWidth = 44;

/** Same bounded width transition and narrow strip as the project board. */
function RuntimeLaneFrame({ compact, collapsed, id, onLayout, children }: {
  compact: boolean; collapsed: boolean; id: RuntimeLane;
  onLayout(x: number, width: number): void; children: ReactElement;
}) {
  const { colors } = useTheme();
  const open = useMotionValue(collapsed ? 0 : 1, collapsed ? motionDuration.reverse : motionDuration.forward, collapsed ? 0 : 1, true);
  return <Animated.View testID={`runtime-lane-${id}`}
    onLayout={e => onLayout(e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
    style={{ width: compact ? "100%" : lerp(open, [collapsedWidth, columnWidth]),
      flex: compact && !collapsed ? 1 : undefined, minHeight: 44,
      backgroundColor: colors.surface1, borderRadius: radius.xl, overflow: "hidden" }}>
    <Enter key={collapsed ? "collapsed" : "expanded"} distance={0} style={{ flex: 1, minHeight: 0 }}>{children}</Enter>
  </Animated.View>;
}

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
export const RuntimeBoard = memo(function RuntimeBoard({ groups, compact, active, stale, loading, onRetry, renderCard,
  collapsed: savedCollapsed, selected: savedSelected, onToggleCollapse: toggleSaved, onSelectGroup }: {
  groups: readonly RuntimeGroup[]; compact: boolean; active: boolean; stale: boolean; loading: boolean; onRetry(): void;
  renderCard(agent: PaseoAgent): ReactElement;
  collapsed?: readonly string[]; selected?: string; onToggleCollapse?(id: RuntimeLane): void; onSelectGroup?(id: RuntimeLane): void;
}) {
  const { colors } = useTheme();
  const [localCollapsed, setCollapsed] = useState<RuntimeLane[]>([]);
  const toggleLocal = useCallback((id: RuntimeLane) => setCollapsed(current => current.includes(id)
    ? current.filter(group => group !== id) : [...current, id]), []);
  const collapsed = savedCollapsed ?? localCollapsed, onToggleCollapse = toggleSaved ?? toggleLocal;
  const [localSelected, setSelected] = useState<RuntimeLane>("attention");
  const selected = savedSelected ?? localSelected;
  const [hoverHeader, setHoverHeader] = useState<RuntimeLane | null>(null);
  const [hoverButton, setHoverButton] = useState<RuntimeLane | null>(null);
  const x = useRef(0), offsets = useRef(new Map<RuntimeLane, number>());
  const shown = groups.filter(g => !["unavailable", "archived"].includes(g.id) || g.sessions.length > 0);
  const laneViewport = useLaneViewport(shown.map(group => ({ id: group.id, width: collapsed.includes(group.id) ? collapsedWidth : columnWidth })));
  const frame = useRef<View>(null), scroll = useRef<RNScrollView>(null);
  const bounds = useRef({ x: 0, y: 0, width: 0, height: 0 }), content = useRef(0);
  const enabled = useRef(false); enabled.current = active && !compact;
  const [panning, setPanning] = useState(false), [barHovered, setBarHovered] = useState(false);
  const [pan] = useState(() => createBoardPan({
    metrics: () => ({ enabled: enabled.current, offset: x.current, viewport: bounds.current.width, content: content.current }),
    scrollTo: value => { x.current = value; scroll.current?.scrollTo({ x: value, animated: false }); }, active: setPanning,
  }));
  const { exclude, cancel, ...panHandlers } = pan;
  useEffect(() => { cancel(); }, [compact, active, collapsed.join("|")]);
  useEffect(() => () => cancel(), []);
  const chosen = shown.some(g => g.id === selected) ? selected : "attention";
  const lane = (group: RuntimeGroup) => <RuntimeLaneFrame key={group.id} id={group.id}
    compact={compact} collapsed={collapsed.includes(group.id)}
    onLayout={(_left, size) => { if (!compact) laneViewport.setLaneWidth(group.id, size); }}>
    {collapsed.includes(group.id) && !compact ? <Pressable
      testID={`runtime-expand-${group.id}`} accessibilityRole="button" accessibilityLabel={t("Expand column")}
      accessibilityState={{ expanded: false }} onPointerDown={exclude} onPress={() => onToggleCollapse(group.id)}
      style={({ pressed }) => ({ ...noFocusRing, flex: 1, minHeight: 0, alignItems: "center", paddingTop: space[3],
        gap: space[2], backgroundColor: pressed ? colors.surface2 : colors.surface1 })}>
      <LaneIconMotion testID={`runtime-icon-${group.id}`} active={active && !stale && laneViewport.visible.includes(group.id) && group.sessions.length > 0 && (group.id === "attention" || group.id === "running")} kind={group.id === "running" ? "spin" : "breathe"}>
        <Icon name={icons[group.id]} size={16} color={group.id === "attention" ? colors.statusWarning : colors.foregroundMuted} />
      </LaneIconMotion>
      <Label muted size={font.sm} selectable={false}>{group.sessions.length}</Label>
      <View style={{ width: 20, height: 140, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 140, alignItems: "center", transform: [{ rotate: "90deg" }] }}>
          <Label medium size={font.md} lines={1} selectable={false}>{t(names[group.id])}</Label>
        </View>
      </View>
    </Pressable> : <View style={{ flex: 1, minHeight: 0, width: compact ? "100%" : columnWidth }}>
    <Pressable accessible={false} onPointerDown={exclude}
      onHoverIn={() => setHoverHeader(group.id)} onHoverOut={() => setHoverHeader(null)}
      testID={`runtime-header-${group.id}`}
      style={{ ...noFocusRing, height: 44, paddingLeft: space[3], paddingRight: space[1.5], gap: space[2], flexDirection: "row", alignItems: "center" }}>
      <LaneIconMotion testID={`runtime-icon-${group.id}`} active={active && !stale && (compact || laneViewport.visible.includes(group.id)) && group.sessions.length > 0 && (group.id === "attention" || group.id === "running")} kind={group.id === "running" ? "spin" : "breathe"}>
        <Icon name={icons[group.id]} size={16} color={group.id === "attention" ? colors.statusWarning : colors.foregroundMuted} />
      </LaneIconMotion>
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space[1.5] }}>
        <Label medium size={font.md} lines={1} selectable={false}>{t(names[group.id])}</Label>
        <Label muted size={font.md} selectable={false}>{group.sessions.length}</Label>
      </View>
      <View style={{ opacity: compact || touch || hoverHeader === group.id || hoverButton === group.id ? 1 : 0 }}>
        <IconButton icon={collapsed.includes(group.id) ? "ChevronsLeftRight" : "ChevronsRightLeft"} size={28}
          label={collapsed.includes(group.id) ? t("Expand column") : t("Collapse {name}", { name: t(names[group.id]) })}
          onHoverChange={hovered => setHoverButton(hovered ? group.id : null)} onPress={() => onToggleCollapse(group.id)} />
      </View>
    </Pressable>
    {!collapsed.includes(group.id) && (compact || laneViewport.visible.includes(group.id)) && <BoardOutputActive.Provider value={active && (compact || laneViewport.visible.includes(group.id))}>
      <FlatList key={group.id} data={group.sessions} keyExtractor={(agent: PaseoAgent) => agent.id}
        renderItem={({ item }: { item: PaseoAgent }) => <View onPointerDown={exclude}>{renderCard(item)}</View>}
        contentOffset={{ x: 0, y: offsets.current.get(group.id) || 0 }}
        onScroll={(e) => offsets.current.set(group.id, e.nativeEvent.contentOffset.y)} scrollEventThrottle={64}
        style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ padding: space[2], paddingBottom: 72, gap: space[2] }}
        initialNumToRender={8} maxToRenderPerBatch={6} windowSize={7} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<View style={{ padding: space[4] }}><Label muted selectable={false}>{t("No sessions")}</Label></View>} />
    </BoardOutputActive.Provider>}
    </View>}
  </RuntimeLaneFrame>;
  return <View testID="runtime-board" style={{ flex: 1, minHeight: 0 }}>
    {loading && <View style={{ padding: space[3] }}><Label muted>{t("Loading sessions…")}</Label></View>}
    {stale && <View style={{ paddingHorizontal: space[3], paddingVertical: space[1] }}><Label muted>{t("Last known")}</Label><Button quiet onPress={onRetry}>{t("Retry")}</Button></View>}
    {compact ? <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ padding: space[2], gap: space[1] }}>
        {shown.map(group => <Pressable key={group.id} testID={`runtime-group-${group.id}`} accessibilityRole="tab"
          accessibilityLabel={t(names[group.id])} accessibilityState={{ selected: chosen === group.id }}
          {...({ "aria-selected": chosen === group.id } as object)} onPointerDown={exclude} onPress={() => (onSelectGroup ?? setSelected)(group.id)}
          style={{ ...noFocusRing, padding: space[2], borderRadius: radius.md, backgroundColor: chosen === group.id ? colors.surface2 : "transparent" }}>
          <Label selectable={false} size={font.sm}>{t(names[group.id])} {group.sessions.length}</Label>
        </Pressable>)}
      </ScrollView>
      {shown.filter(g => g.id === chosen).map(lane)}
    </> : <View ref={frame} testID="runtime-pan" {...panHandlers}
      onPointerMove={event => { pan.onPointerMove(event); setBarHovered(hoveringBoardScrollbar(event.nativeEvent, bounds.current)); }}
      onPointerLeave={() => { cancel(); setBarHovered(false); }}
      onLayout={event => { cancel(); laneViewport.setViewportWidth(event.nativeEvent.layout.width); frame.current?.measureInWindow((bx, by, bw, bh) => { bounds.current = { x: bx, y: by, width: bw, height: bh }; }); }}
      style={{ flex: 1, minHeight: 0, overflow: "hidden", ...(panning ? { cursor: "grabbing" } as object : {}) }}>
      <ScrollView ref={scroll} horizontal nestedScrollEnabled showsHorizontalScrollIndicator={barHovered && !panning}
      onContentSizeChange={size => { content.current = size; }}
      onScroll={e => { x.current = e.nativeEvent.contentOffset.x; laneViewport.observeScroll(x.current, e.nativeEvent.layoutMeasurement?.width); }} scrollEventThrottle={64}
      style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ padding: space[3], gap: columnGap, flexDirection: "row" }}>
      {shown.map(lane)}
    </ScrollView></View>}
  </View>;
});
