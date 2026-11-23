import { memo, useMemo, useState, type RefObject } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { RuntimeProject, RuntimeProjectFilter } from "../shared/runtime-projects";
import { t } from "../shared/i18n";
import { useShortcutBlock } from "./shortcuts";
import { Label, TextBox, font, noFocusRing, radius, space, touch, useTheme } from "./ui";

export const RuntimeProjectButton = memo(function RuntimeProjectButton({ buttonRef, count, open, disabled, onPress }: {
  buttonRef: RefObject<View | null>; count: number; open: boolean; disabled: boolean; onPress(): void;
}) {
  const { colors } = useTheme();
  return <Pressable ref={buttonRef} testID="runtime-project-filter" accessibilityRole="button"
    accessibilityLabel={t("Filter Flowly projects")} accessibilityState={{ expanded: open, disabled }}
    {...({ "aria-expanded": open } as object)} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ ...noFocusRing, flexDirection: "row", alignItems: "center", gap: space[1.5], minHeight: touch ? 40 : 32,
      maxWidth: 160, paddingHorizontal: space[2], borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
      backgroundColor: open || pressed ? colors.surface2 : "transparent", opacity: disabled ? 0.45 : 1 })}>
    <Icon name="FolderKanban" size={15} color={count ? colors.accent : colors.foregroundMuted} />
    <Label size={font.md} selectable={false}>{t("Project")}{count ? ` ${count}` : ""}</Label>
    <Icon name="ChevronDown" size={13} color={colors.foregroundMuted} />
  </Pressable>;
});

/** Kept open for multiple picks, using the board's anchored popover/compact sheet. */
export function RuntimeProjectOptions({ projects, selected, active, onToggle, onUnlinked, onReset, onClose }: {
  projects: readonly RuntimeProject[]; selected: RuntimeProjectFilter; active: boolean;
  onToggle(id: string): void; onUnlinked(): void; onReset(): void; onClose(): void;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  useShortcutBlock(active);
  const names = useMemo(() => {
    const counts = new Map<string, number>(); projects.forEach(p => counts.set(p.title, (counts.get(p.title) ?? 0) + 1)); return counts;
  }, [projects]);
  const missing = selected.ids.filter(id => !projects.some(p => p.id === id));
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = projects.filter(p => words.every(word => `${p.title} ${p.primaryPath}`.toLowerCase().includes(word)));
  const row = (id: string, title: string, checked: boolean, onPress: () => void, detail?: string, archived = false) => <Pressable
    key={id} testID={`runtime-project-option-${id}`} accessibilityRole="checkbox" accessibilityLabel={title}
    accessibilityState={{ checked }} {...({ "aria-checked": checked } as object)} onPress={onPress}
    style={({ pressed }) => ({ ...noFocusRing, flexDirection: "row", alignItems: "center", gap: space[2], minHeight: touch ? 44 : 34, paddingHorizontal: space[2], paddingVertical: space[1.5], borderRadius: radius.md, backgroundColor: checked || pressed ? colors.surface2 : "transparent" })}>
    <Icon name={checked ? "SquareCheck" : "Square"} size={16} color={checked ? colors.accent : colors.foregroundMuted} />
    <View style={{ flex: 1, minWidth: 0 }}><Label size={font.md} lines={1} selectable={false}>{title}</Label>
      {!!detail && <Label muted size={font.xs} lines={1} selectable={false}>{detail}</Label>}</View>
    {archived && <Label muted size={font.xs} selectable={false}>{t("Archived")}</Label>}
  </Pressable>;
  return <View testID="runtime-project-options" style={{ gap: 2 }}>
    <TextBox value={query} onChangeText={setQuery} commitDelay={150} accessibilityLabel={t("Search projects")}
      placeholder={t("Search projects")} placeholderTextColor={colors.foregroundMuted} maxLength={200}
      onKeyPress={event => { if (event.nativeEvent.key === "Escape" && !(event.nativeEvent as { isComposing?: boolean }).isComposing) { event.stopPropagation(); onClose(); } }}
      style={{ ...noFocusRing, height: touch ? 40 : 32, marginBottom: space[1], paddingHorizontal: space[2], borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.foreground, fontSize: font.md }} />
    {row("all", t("All projects"), !selected.ids.length && !selected.unlinked, onReset)}
    {row("unlinked", t("Unlinked to Flowly"), selected.unlinked, onUnlinked)}
    <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space[1] }} />
    {shown.map(project => row(project.id, project.title, selected.ids.includes(project.id), () => onToggle(project.id), (names.get(project.title) ?? 0) > 1 ? project.primaryPath : undefined, !!project.archivedAt))}
    {missing.map(id => row(id, t("Project unavailable"), true, () => onToggle(id), id.slice(-8)))}
    {!shown.length && <Label muted size={font.sm}>{t("No projects found")}</Label>}
  </View>;
}
