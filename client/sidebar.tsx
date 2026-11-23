import { Pressable, Text, View } from "react-native";
import { LocaleRoot } from "./i18n";
import { useRpc, type PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { readSidebarCounts } from "../shared/rpc";
import { attentionBadgeText, attentionScreenParams } from "./attention";
import { CountPill, Theme, noFocusRing } from "./ui";
import { tn } from "../shared/i18n";
import { MotionProvider } from "./motion";
import { NativeRunningRing } from "./native-running-ring";

/**
 * One tiny response for Attention and host-wide running counts; decoding stays on the daemon.
 */
const SIDEBAR_POLL_MS = 3_000;

/** Do not present retained counts as current after a failed refresh. */
function useSidebarCounts() {
  const count = useRpc(readSidebarCounts);
  const badge = useQuery({ queryKey: ["flowly", "sidebar-counts"], queryFn: () => count({}),
    refetchInterval: SIDEBAR_POLL_MS, retry: 1 });
  return badge.isError ? undefined : badge.data;
}

export function SidebarEntry(props: PluginSidebarItemProps) {
  return (
    <LocaleRoot>
      <SidebarEntryRow {...props} />
    </LocaleRoot>
  );
}

function SidebarEntryRow({ currentScreen, openScreen, theme }: PluginSidebarItemProps) {
  const counts = useSidebarCounts();
  const count = counts?.attention ?? null;
  const running = counts?.running ?? 0;
  const text = attentionBadgeText(count);
  return (
    <SidebarRow
      icon="PanelsTopLeft"
      active={currentScreen?.screenId === "board"}
      onPress={() => openScreen({ screenId: "board" })}
      trailing={
        text || running > 0 ? (
          <Theme.Provider value={theme}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {running > 0 && <MotionProvider><RunningCount count={running} foreground={theme.colors.foregroundMuted} /></MotionProvider>}
              {text && <Pressable style={noFocusRing}
              accessibilityRole="button"
              accessibilityLabel={tn(count ?? 0, "Open Needs attention, {text} card", "Open Needs attention, {text} cards", { text })}
              hitSlop={10}
              onPress={() =>
                openScreen({
                  screenId: "board",
                  params: attentionScreenParams(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                })
              }
            >
              <CountPill text={text} />
              </Pressable>}
            </View>
          </Theme.Provider>
        ) : null
      }
    />
  );
}

/** Informational, like the native Tasks count; the parent row keeps its normal action. */
function RunningCount({ count, foreground }: { count: number; foreground: string }) {
  return <View testID="flowly-sidebar-running" accessible
    accessibilityLabel={tn(count, "{n} running conversation", "{n} running conversations")}
    style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
    <NativeRunningRing />
    <Text selectable={false} style={{ color: foreground, fontSize: 12, lineHeight: 16, fontWeight: "400", fontVariant: ["tabular-nums"] }}>{count}</Text>
  </View>;
}
