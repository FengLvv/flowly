import { Animated, Pressable, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Label, noFocusRing, radius, space, useTheme } from "./ui";
import { lerp, useMotionPresence } from "./motion";
import { t } from "../shared/i18n";

/** The anchor is the Plus button, never a pointer coordinate or a compact sheet. */
export function ComposerAddMenu({ open, onImage, onForge, onFile }: { open: boolean; onImage(): void; onForge(): void; onFile(): void }) {
  const { colors } = useTheme(), presence = useMotionPresence(open ? "add" : null, open ? "add" : "");
  if (!presence.item) return null;
  const entries = [{ id: "image", icon: "ImagePlus", title: t("Add image"), run: onImage }, { id: "forge", icon: "GitPullRequest", title: t("Add issue or PR"), run: onForge }, { id: "file", icon: "FileUp", title: t("Upload file"), run: onFile }];
  return <Animated.View testID="composer-add-menu" pointerEvents={open ? "auto" : "none"} style={{ position: "absolute", bottom: 36, left: 0, width: 248, zIndex: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface2, paddingVertical: space[1], opacity: presence.progress, transform: [{ translateY: lerp(presence.progress, [6, 0]) }] }}>
    {entries.map(entry => <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={entry.title} onPress={entry.run} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ ...noFocusRing, height: 36, paddingHorizontal: space[3], flexDirection: "row", alignItems: "center", gap: space[2], backgroundColor: pressed || hovered ? colors.surface1 : "transparent" })}>
      <Icon name={entry.icon} size={18} color={colors.foregroundMuted} /><Label selectable={false}>{entry.title}</Label>
    </Pressable>)}
  </Animated.View>;
}
