import { useEffect, useRef } from "react";
import { Animated, Pressable, View } from "react-native";
import { FlatList } from "@getpaseo/plugin/client/react-native";
import { t } from "../shared/i18n";
import type { ComposerCommand } from "../shared/composer-commands";
import { Button, Label, font, noFocusRing, radius, space, useTheme } from "./ui";
import { lerp, useMotionPresence } from "./motion";

export function ComposerCommandMenu({ open, commands, selected, loading, error, onRetry, onChoose }: {
  open: boolean; commands: readonly ComposerCommand[]; selected: number; loading: boolean; error: string; onRetry(): void; onChoose(command: ComposerCommand): void;
}) {
  const { colors } = useTheme();
  const presence = useMotionPresence(open ? "commands" : null, open ? "commands" : "");
  const list = useRef<{ scrollToIndex(options: { index: number; animated: boolean; viewPosition?: number }): void; scrollToOffset(options: { offset: number; animated: boolean }): void } | null>(null);
  useEffect(() => { if (commands.length) list.current?.scrollToIndex({ index: selected, animated: false, viewPosition: 0.5 }); }, [selected, commands]);
  if (!presence.item) return null;
  return <Animated.View testID="composer-command-menu" pointerEvents={open ? "auto" : "none"} style={{ position: "absolute", bottom: "100%", left: 0, right: 0, zIndex: 20, marginBottom: space[2], borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface1, overflow: "hidden", maxHeight: 280, opacity: presence.progress, transform: [{ translateY: lerp(presence.progress, [6, 0]) }] }}>

      {loading && <View style={{ padding: space[3] }}><Label muted>{t("Loading commands…")}</Label></View>}
      {!!error && <View style={{ padding: space[3] }}><Label muted>{error}</Label><Button quiet onPress={onRetry}>{t("Retry")}</Button></View>}
      {!loading && !error && !commands.length && <View style={{ padding: space[3] }}><Label muted>{t("No matching commands")}</Label></View>}
      <FlatList ref={list as never} data={commands} keyExtractor={(command: ComposerCommand) => `${command.kind || "command"}:${command.name}`}
        keyboardShouldPersistTaps="handled" initialNumToRender={8} maxToRenderPerBatch={8} windowSize={3} style={{ maxHeight: 280, flexGrow: 0 }}
        onScrollToIndexFailed={(info: { index: number; averageItemLength: number }) => list.current?.scrollToOffset({ offset: info.index * info.averageItemLength, animated: false })}
        renderItem={({ item: command, index }: { item: ComposerCommand; index: number }) => <Pressable accessibilityRole="button" accessibilityLabel={`/${command.name.replace(/^\//, "")}`} accessibilityState={{ selected: selected === index }} onPress={() => onChoose(command)}
        style={{ ...noFocusRing, padding: space[3], gap: 2, backgroundColor: selected === index ? colors.surface2 : "transparent" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}><Label medium selectable={false}>/{command.name.replace(/^\//, "")}</Label><Label muted size={font.xs} selectable={false}>{command.hostOnly ? t("Open in Paseo") : command.kind === "skill" ? t("Skill") : t("Command")}</Label></View>
        {!!command.description && <Label muted size={font.sm} lines={2} selectable={false}>{command.description}</Label>}
        {!!command.argumentHint && <Label muted size={font.xs} selectable={false}>{command.argumentHint}</Label>}
      </Pressable>} />
  </Animated.View>;
}
