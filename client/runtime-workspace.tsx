import { memo, useMemo } from "react";
import { View } from "react-native";
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import { usePaseo } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import type { PaseoAgent } from "@getpaseo/client";
import { runtimeWorkspaceSessions } from "../shared/runtime-parent";
import { sessionAttention } from "../shared/session-attention";
import { isSummarizer } from "../shared/summary";
import { t } from "../shared/i18n";
import { useLiveAgents } from "./queries";
import { useSessionReads } from "./session-reads";
import { SessionCard } from "./session-card";
import { Button, IconButton, Label, Notice, font, message, space, useTheme } from "./ui";

export function RuntimeParentWait({ error, onRetry, onClose }: { error?: string; onRetry(): void; onClose(): void }) {
  const { colors } = useTheme();
  return <View testID="runtime-parent-loading" style={{ flex: 1, minHeight: 0 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], padding: space[2], borderBottomWidth: 1, borderColor: colors.border }}>
      <IconButton icon="ArrowLeft" label={t("Back to Runtime")} onPress={onClose} />
      <View style={{ flex: 1 }}><Label medium>{t("Workspace")}</Label></View>
      <IconButton icon="X" label={t("Close side bar")} onPress={onClose} />
    </View>
    <View style={{ padding: space[3], gap: space[2] }}>{error ? <><Notice>{error}</Notice><Button quiet onPress={onRetry}>{t("Retry")}</Button></> : <Label muted>{t("Loading cards…")}</Label>}</View>
  </View>;
}

/** A real native workspace parent for conversations without a Flowly card. No synthetic card or actions. */
export const RuntimeWorkspace = memo(function RuntimeWorkspace({ workspaceId, hostId, sessions, active, stale, loading,
  cardUnavailable, onOpen, onClose, onRetry }: {
  workspaceId: string; hostId: string; sessions: readonly PaseoAgent[]; active: boolean; stale: boolean; loading: boolean;
  cardUnavailable?: boolean; onOpen(agent: PaseoAgent): void; onClose(): void; onRetry(): void;
}) {
  const { colors } = useTheme(), paseo = usePaseo();
  const workspace = useQuery({ queryKey: ["flowly", "runtime-workspace", hostId, workspaceId],
    queryFn: () => paseo.workspaces.ref(workspaceId).refresh(), enabled: active && !!workspaceId,
    staleTime: 5000, refetchInterval: active ? 15000 : false });
  const live = useLiveAgents({ enabled: active });
  const reads = useSessionReads(active);
  const rows = useMemo(() => runtimeWorkspaceSessions(workspaceId, sessions, live.data || []).filter(agent => !isSummarizer(agent)), [workspaceId, sessions, live.data]);
  const available = workspace.data?.id === workspaceId && !workspace.data.archivingAt && !workspace.isError;
  const retry = () => { void workspace.refetch(); void live.refetch(); onRetry(); };
  return <View testID="runtime-workspace-pane" style={{ flex: 1, minHeight: 0 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], padding: space[2], borderBottomWidth: 1, borderColor: colors.border }}>
      <IconButton icon="ArrowLeft" label={t("Back to Runtime")} onPress={onClose} />
      <Icon name="Folder" size={16} color={colors.foregroundMuted} />
      <View style={{ flex: 1, minWidth: 0 }}><Label medium size={font.base} lines={1}>{workspace.data?.id === workspaceId ? workspace.data.name : t("Workspace")}</Label></View>
      <IconButton icon="X" label={t("Close side bar")} onPress={onClose} />
    </View>
    <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ padding: space[3], gap: space[3] }} keyboardShouldPersistTaps="handled">
      {cardUnavailable && <Notice>{t("Linked card unavailable.")}</Notice>}
      {!available ? <View style={{ gap: space[2] }}>
        {workspace.isPending ? <Label muted>{t("Loading…")}</Label> : <><Notice>{workspace.error ? message(workspace.error) : t("Workspace unavailable.")}</Notice><Button quiet onPress={retry}>{t("Retry")}</Button></>}
      </View> : <>
        {!!workspace.data?.workspaceDirectory && <Label muted mono size={font.sm} selectable>{workspace.data.workspaceDirectory}</Label>}
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}><Label medium>{t("Sessions")}</Label><Label muted>{rows.length}</Label></View>
        {(stale || live.isError) && <View style={{ gap: space[1] }}><Label muted>{t("Last known")}</Label><Button quiet onPress={retry}>{t("Retry")}</Button></View>}
        {rows.map((agent, index) => <View key={agent.id} testID={`runtime-workspace-session-${agent.id}`}>
          <SessionCard agent={agent} events={[]} first={!index} attention={sessionAttention(agent, undefined, reads.receipts)}
            readStateUnavailable={reads.query.isError} onPress={() => onOpen(agent)} />
        </View>)}
        {!rows.length && <Label muted>{loading ? t("Loading sessions…") : t("No sessions")}</Label>}
      </>}
    </ScrollView>
  </View>;
});
