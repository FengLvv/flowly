import { useState } from "react";
import { View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "./modal";
import { Button, Label, Notice, Row, TextBox, font, message, radius, space, useTheme } from "./ui";
import * as rpc from "../shared/rpc";
import type { ForgeReference } from "../shared/session-files";
import type { SessionTarget } from "../shared/session-target";
import { t } from "../shared/i18n";

export function ComposerForge({ target, onClose, onChoose }: { target: SessionTarget; onClose(): void; onChoose(item: ForgeReference): void }) {
  const { colors } = useTheme(), search = useRpc(rpc.searchSessionForge);
  const [query, setQuery] = useState("");
  const result = useQuery({ queryKey: ["flowly", "composer-forge", target.agentId, query], queryFn: () => search({ ...target, query }), staleTime: 0, refetchOnWindowFocus: false });
  return <Modal open title={t("Add issue or PR")} onOpenChange={open => { if (!open) onClose(); }}><Modal.Content>
    <View style={{ gap: space[2] }}>
      <TextBox value={query} onChangeText={setQuery} commitDelay={250} autoFocus accessibilityLabel={t("Search issues and pull requests")} placeholder={t("Search issues and pull requests")} style={{ height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space[3], color: colors.foreground, fontSize: font.base }} />
      {result.isPending ? <Label muted>{t("Searching…")}</Label> : result.isError ? <><Notice>{message(result.error)}</Notice><Button quiet onPress={() => void result.refetch()}>{t("Retry")}</Button></> : !result.data?.length ? <Label muted>{t("No results")}</Label> : result.data.map(item => <Row key={`${item.type}:${item.url}`} title={`#${item.number} ${item.title}`} detail={item.url} icon={item.type === "forge_issue" ? "CircleDot" : "GitPullRequest"} onPress={() => { onChoose(item); onClose(); }} />)}
    </View>
  </Modal.Content></Modal>;
}
