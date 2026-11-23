import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { Animated, Platform, Pressable, View, useWindowDimensions } from "react-native";
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import { msg, t } from "../shared/i18n";
import { runtimeSortKeys, type RuntimeRange, type RuntimeSort, type RuntimeSortKey } from "../shared/runtime-filter";
import { eventPoint, useMenuOpener, type MenuEntry } from "./context-menu";
import { RuntimeProjectButton } from "./runtime-project-filter";
import { useMotionPresence } from "./motion";
import { IconButton, Label, TextBox, font, noFocusRing, radius, space, touch, useTheme } from "./ui";

/** RNW drops title on View. Keep help local, inert and outside the button's layout. */
function useHoverHelp(text: string, testID: string) {
  const { colors } = useTheme(), window = useWindowDimensions();
  const ref = useRef<View>(null), generation = useRef(0);
  const [left, setLeft] = useState(0), [open, setOpen] = useState(false);
  const width = Math.min(240, Math.max(80, window.width - 16));
  const close = () => { generation.current++; setOpen(false); };
  useEffect(() => { close(); return () => { generation.current++; }; }, [window.width, window.height]);
  const show = () => {
    if (Platform.OS !== "web") return;
    const run = ++generation.current;
    ref.current?.measureInWindow(x => {
      if (run !== generation.current) return;
      setLeft(Math.max(8, Math.min(x, window.width - width - 8)) - x);
      setOpen(true);
    });
  };
  const presence = useMotionPresence(open ? text : null, open ? testID : "");
  return {
    ref, handlers: { onHoverIn: show, onHoverOut: close, onFocus: show, onBlur: close },
    help: presence.item ? <Animated.View testID={testID} pointerEvents="none" accessibilityElementsHidden
      {...({ "aria-hidden": true } as object)} style={{ position: "absolute", zIndex: 1000, top: "100%", marginTop: 4, left, width,
        padding: space[2], borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface0,
        opacity: presence.progress }}>
      <Label size={font.sm} selectable={false}>{presence.item}</Label>
    </Animated.View> : null,
  };
}

export const BoardSearch = memo(function BoardSearch({ value, onChange, runtime = false, full = false, onSearch }: {
  value: string; onChange(value: string): void; runtime?: boolean; full?: boolean; onSearch(): void;
}) {
  const { colors } = useTheme();
  const help = useHoverHelp(runtime ? t("Search conversation text") : t("Search everywhere"), runtime ? "runtime-search-help" : "board-search-help");
  return <View testID={runtime ? "runtime-search" : "board-search"} style={{ zIndex: 2, flexDirection: "row", alignItems: "center", gap: space[1], width: 280, maxWidth: "100%", flexShrink: 1 }}>
    <View style={{ flex: 1, minWidth: 0, height: touch ? 40 : 32, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingLeft: space[2] }}>
      <Icon name="Search" size={15} color={colors.foregroundMuted} />
      <TextBox value={value} onChangeText={onChange} commitDelay={200} maxLength={200}
        accessibilityLabel={runtime ? t("Search conversations") : t("Search tasks")}
        placeholder={runtime ? t("Search conversations") : t("Search tasks")} placeholderTextColor={colors.foregroundMuted}
        style={{ flex: 1, minWidth: 0, height: "100%", paddingHorizontal: space[2], paddingVertical: 0, color: colors.foreground, fontSize: font.md, ...noFocusRing }} />
      {!!value && <IconButton icon="X" label={t("Clear search")} onPress={() => onChange("")} />}
    </View>
    <Pressable ref={help.ref} {...help.handlers} accessibilityRole={runtime ? "switch" : "button"}
      accessibilityLabel={runtime ? t("Search conversation text") : t("Search everywhere")}
      accessibilityState={runtime ? { checked: full } : undefined} onPress={onSearch}
      {...(runtime ? { "aria-checked": full } as object : {})}
      style={({ pressed }) => ({ ...noFocusRing, width: touch ? 40 : 32, height: touch ? 40 : 32, justifyContent: "center", alignItems: "center", borderRadius: radius.md, backgroundColor: full || pressed ? colors.surface2 : "transparent" })}>
      <Icon name="ListFilter" size={17} color={full ? colors.accent : colors.foregroundMuted} />
      {help.help}
    </Pressable>
  </View>;
});

const sortNames: Record<RuntimeSortKey, string> = {
  title: msg("Title"), project: msg("Project"), workspace: msg("Workspace"), folder: msg("Folder"),
  created: msg("Created"), updated: msg("Updated"), context: msg("Context usage"),
};

export const RuntimeToolbar = memo(function RuntimeToolbar({ query, onQuery, range, onRange, sort, onSort, full, onFull, hideSubagents, onSubagents, pending, errors, onRetry, projectRef, projectCount, projectOpen, projectsReady, onProjects }: {
  query: string; onQuery(value: string): void; range: RuntimeRange; onRange(value: RuntimeRange): void;
  sort: RuntimeSort; onSort(value: RuntimeSort): void; full: boolean; onFull(): void;
  hideSubagents: boolean; onSubagents(): void;
  pending: number; errors: number; onRetry(): void;
  projectRef: RefObject<View | null>; projectCount: number; projectOpen: boolean; projectsReady: boolean; onProjects(): void;
}) {
  const { colors } = useTheme(), open = useMenuOpener();
  const subagentHelp = useHoverHelp(hideSubagents ? t("Show subagents") : t("Hide subagents"), "runtime-subagents-help");
  const entries = (): MenuEntry[] => [
    { id: "default", label: t("Default order"), checked: !sort, onPress: () => onSort(null) },
    { kind: "separator", id: "keys" },
    ...runtimeSortKeys.flatMap(key => (["asc", "desc"] as const).map(direction => ({
      id: `${key}-${direction}`, label: `${t(sortNames[key])} · ${direction === "asc" ? t("Ascending") : t("Descending")}`,
      icon: direction === "asc" ? "ArrowUp" : "ArrowDown", checked: sort?.key === key && sort.direction === direction,
      onPress: () => onSort({ key, direction }),
    }))),
  ];
  return <View testID="runtime-toolbar" style={{ zIndex: 20, paddingHorizontal: space[3], paddingVertical: space[1.5], borderBottomWidth: 1, borderColor: colors.border, gap: space[1.5], flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
    <BoardSearch value={query} onChange={onQuery} runtime full={full} onSearch={onFull} />
    <Pressable ref={subagentHelp.ref} {...subagentHelp.handlers} testID="runtime-subagents-toggle" accessibilityRole="switch" accessibilityLabel={t("Show subagents")}
      accessibilityHint={hideSubagents ? t("Show subagents") : t("Hide subagents")} accessibilityState={{ checked: !hideSubagents }}
      {...({ "aria-checked": !hideSubagents } as object)} onPress={onSubagents}
      style={({ pressed }) => ({ ...noFocusRing, zIndex: 3, width: touch ? 40 : 32, height: touch ? 40 : 32, flexShrink: 0,
        alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
        backgroundColor: !hideSubagents || pressed ? colors.surface2 : "transparent" })}>
      <Icon name={hideSubagents ? "ListTree" : "Network"} size={17} color={hideSubagents ? colors.foregroundMuted : colors.foreground} />
      {subagentHelp.help}
    </Pressable>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 1, maxWidth: "100%" }} contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
      <RuntimeProjectButton buttonRef={projectRef} count={projectCount} open={projectOpen} disabled={!projectsReady} onPress={onProjects} />
      <Label muted size={font.sm} selectable={false}>{t("Range")}</Label>
      <View style={{ flexDirection: "row", padding: 2, gap: 2, borderRadius: radius.lg, backgroundColor: colors.surface2 }}>
        {(["24h", "7d", "all"] as const).map(value => <Pressable key={value} accessibilityRole="button"
          accessibilityLabel={`${t("Range")}: ${value === "all" ? "∞" : value}`} accessibilityState={{ selected: range === value }}
          {...({ "aria-pressed": range === value } as object)} onPress={() => onRange(value)}
          style={({ pressed }) => ({ ...noFocusRing, minWidth: 42, height: touch ? 36 : 28, paddingHorizontal: space[2], justifyContent: "center", alignItems: "center", borderRadius: radius.md, backgroundColor: range === value || pressed ? colors.surface0 : "transparent" })}>
          <Label selectable={false} size={font.md} muted={range !== value}>{value === "all" ? "∞" : value}</Label>
        </Pressable>)}
      </View>
      <Pressable testID="runtime-sort" accessibilityRole="button" accessibilityLabel={t("Sort conversations")}
        onPress={event => open?.(eventPoint(event), t("Sort"), entries())}
        style={({ pressed }) => ({ ...noFocusRing, flexDirection: "row", alignItems: "center", gap: space[1.5], minHeight: touch ? 40 : 32, paddingHorizontal: space[2], borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: pressed ? colors.surface2 : "transparent" })}>
        <Icon name={sort?.direction === "asc" ? "ArrowUp" : sort ? "ArrowDown" : "ArrowUpDown"} size={15} color={sort ? colors.accent : colors.foregroundMuted} />
        <Label size={font.md} selectable={false}>{sort ? t(sortNames[sort.key]) : t("Sort")}</Label>
        <Icon name="ChevronDown" size={13} color={colors.foregroundMuted} />
      </Pressable>
    </ScrollView>
    {!!pending && <Label muted size={font.sm}>{t("Searching {n} conversations…", { n: pending })}</Label>}
    {!!errors && <Pressable accessibilityRole="button" onPress={onRetry} style={noFocusRing}><Label size={font.sm} color={colors.statusWarning}>{t("{n} conversations could not be searched. Retry", { n: errors })}</Label></Pressable>}
  </View>;
});
