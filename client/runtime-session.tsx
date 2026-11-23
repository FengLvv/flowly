import { memo, useCallback, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { copyText, useToast } from "@getpaseo/plugin/client/react-native";
import type { PaseoAgent } from "@getpaseo/client";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { sessionAttention, type SessionReadReceipt } from "../shared/session-attention";
import { t } from "../shared/i18n";
import { SessionCard } from "./session-card";
import { SessionPreview } from "./session-preview";
import { useComposer } from "./composer";
import { menuHandlers, useMenuOpener } from "./context-menu";
import { Button, Label, Notice, font, message, radius, space, useTheme } from "./ui";
import { useStableCallback } from "./stable";
import type { BoardEvent } from "../shared/model";
import type { RuntimeTarget } from "../shared/runtime-parent";
export type { RuntimeTarget } from "../shared/runtime-parent";

const noEvents: BoardEvent[] = [];

export const RuntimeSessionCard = memo(function RuntimeSessionCard({ agent, source, selected, receipts, readUnavailable, onOpen }: {
  agent: PaseoAgent; source: string; selected: boolean; receipts: readonly SessionReadReceipt[];
  readUnavailable: boolean; onOpen(agent: PaseoAgent): void;
}) {
  const { colors } = useTheme(), menu = useMenuOpener(), toast = useToast();
  const open = useCallback(() => onOpen(agent), [onOpen, agent]);
  return <View testID={`runtime-session-${agent.id}`} style={{ gap: space[1] }}>
    {!!source && <Label muted size={font.xs} lines={1} selectable={false}>{source}</Label>}
    <View style={{ borderWidth: 1, borderColor: selected ? colors.accent : colors.border, borderRadius: radius.lg, backgroundColor: colors.surface0, overflow: "hidden" }}>
      <SessionCard agent={agent} events={noEvents} highlighted={selected} attention={sessionAttention(agent, undefined, receipts)}
        readStateUnavailable={readUnavailable} onPress={open}
        menu={menuHandlers(menu, agent.title || t("Session"), () => [
          { id: "open", label: t("Open conversation"), icon: "MessageSquare", onPress: open },
          { id: "copy", label: t("Copy session ID"), icon: "Copy", onPress: () => void copyText(agent.id).then(() => toast.show(t("Copied"), { variant: "success" })) },
        ])} />
    </View>
  </View>;
});

/** The original Flowly chat UI, with a real native workspace target and no synthetic card. */
export function RuntimeSessionPane({ target, compact, hostId, navigation, active, onBack, onClose, refresh, draftMemory }: {
  target: RuntimeTarget; compact: boolean; hostId: string; navigation: PluginSurfaceProps["navigation"];
  active: boolean; onBack(): void; onClose(): void; refresh(): void; draftMemory: Map<string, string>;
}) {
  const composer = useComposer(active);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(draftMemory));
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const locks = useRef(new Set<string>());
  const targets = useRef(new Map<string, string>()), draftValues = useRef<Record<string, string>>({ ...drafts });
  targets.current.set(target.id, target.workspaceId);
  // Seed before mounting the native input. Focus must never beat the daemon draft read.
  if (!draftMemory.has(target.id) && composer.state) {
    const value = composer.state.sessions[target.id]?.draft || "";
    draftMemory.set(target.id, value);
    draftValues.current[target.id] = value;
  }
  const begin = useStableCallback((id: string) => {
    if (locks.current.has(id)) return false;
    locks.current.add(id); setBusy(new Set(locks.current)); return true;
  });
  const end = useStableCallback((id: string) => { locks.current.delete(id); setBusy(new Set(locks.current)); });
  const change = useStableCallback((id: string, text: string, expected?: string) => {
    const workspaceId = targets.current.get(id);
    if (!workspaceId || (expected !== undefined && (draftValues.current[id] || "") !== expected)) return;
    draftMemory.set(id, text);
    draftValues.current = { ...draftValues.current, [id]: text };
    setDrafts(draftValues.current);
    composer.saveDraft({ workspaceId }, id, text, expected !== undefined);
  });
  const focus = useStableCallback((_id: string) => {});
  if (!draftMemory.has(target.id)) return <View style={{ flex: 1, padding: space[3], gap: space[2] }}>
    {composer.query.isError ? <><Notice>{message(composer.query.error)}</Notice><Button onPress={() => void composer.query.refetch()}>{t("Retry")}</Button></> : <Label muted>{t("Loading…")}</Label>}
  </View>;
  return <View testID="runtime-session-pane" style={{ flex: 1, minHeight: 0 }}>
    <SessionPreview key={`${target.id}|${target.workspaceId}`} workspaceId={target.workspaceId} sessionId={target.id}
      hostId={hostId} compact={compact} events={noEvents} unavailable={!target.workspaceId}
      navigation={navigation} draft={drafts[target.id] ?? draftMemory.get(target.id) ?? ""} pending={busy.has(target.id)}
      beginOperation={begin} endOperation={end} onDraftChange={change}
      onComposerFocus={focus} onBack={onBack} backLabel={target.workspaceId ? t("Back to workspace") : t("Back to Runtime")}
      onClose={onClose} refresh={refresh} visible={active} />
  </View>;
}
