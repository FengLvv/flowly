import { memo, useRef, useState } from "react";
import { View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@getpaseo/plugin/client/react-native";
import type { CardDetail } from "../shared/card-detail";
import { t } from "../shared/i18n";
import type { Task } from "../shared/model";
import { appendTaskSupplement } from "../shared/rpc";
import { taskSupplementLimits, type TaskSupplement } from "../shared/task-supplements";
import { detailKey, invalidateCardViews, useTaskDetail } from "./card-detail-query";
import { Enter } from "./motion";
import { newMessageId } from "./sent-images";
import { Button, Field, IconButton, Label, Notice, font, message, space } from "./ui";

const empty: TaskSupplement[] = [];

export function SupplementList({ entries, draft, setDraft, add, remove, disabled, readOnly = false }: {
  entries: readonly TaskSupplement[];
  draft: string;
  setDraft(text: string): void;
  add(): boolean | Promise<boolean>;
  remove?(id: string): void;
  disabled: boolean;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const full = entries.length >= taskSupplementLimits.perTask;
  const canAdd = !disabled && !full && !!draft.trim();
  if (readOnly && !entries.length) return null;
  async function submit() {
    if (canAdd && await add()) setEditing(false);
  }
  function discard() {
    setDraft("");
    setEditing(false);
  }
  return (
    <View style={{ gap: space[2] }}>
      <Label medium size={font.sm} muted>{t("Supplemental notes")}</Label>
      {entries.map((entry) => (
        <View key={entry.id} style={{ flexDirection: "row", alignItems: "flex-start", gap: space[2] }}>
          <Label muted>•</Label>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Label selectable>{entry.text}</Label>
          </View>
          {remove && <IconButton icon="X" label={t("Remove note")} disabled={disabled} onPress={() => remove(entry.id)} />}
        </View>
      ))}
      {!readOnly && (
        <>
          {editing ? (
            <Enter distance={3} style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Field title={t("Supplemental notes")} hideTitle value={draft} onChange={setDraft}
                  maxLength={taskSupplementLimits.text} editable={!disabled && !full}
                  autoFocus onSubmit={() => void submit()} />
              </View>
              <Button small disabled={!canAdd} onPress={() => void submit()}>{t("Add")}</Button>
              <IconButton icon="X" label={t("Cancel")} disabled={disabled} onPress={discard} />
            </Enter>
          ) : (
            <View style={{ alignSelf: "flex-start" }}>
              <Button small icon="Plus" disabled={disabled || full} onPress={() => setEditing(true)}>{t("Add note")}</Button>
            </View>
          )}
          {full && <Label muted size={font.sm}>{t("You can add up to {count} supplemental notes.", { count: taskSupplementLimits.perTask })}</Label>}
        </>
      )}
    </View>
  );
}

export const SidebarSupplements = memo(function SidebarSupplements({ task, active, readOnly }: {
  task: Task;
  active: boolean;
  readOnly: boolean;
}) {
  const { hostId } = useTaskDetail();
  const client = useQueryClient();
  const save = useRpc(appendTaskSupplement);
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitted = useRef<TaskSupplement | null>(null);
  const lock = useRef(false);
  async function add() {
    const text = draft.trim();
    if (!active || readOnly || lock.current || !text) return false;
    const entry = submitted.current?.text === text ? submitted.current : { id: newMessageId(), text };
    submitted.current = entry;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      const saved = await save({ taskId: task.id, entry });
      const key = detailKey(hostId, saved.id, saved.workspaceId);
      await client.cancelQueries({ queryKey: key, exact: true });
      client.setQueryData<CardDetail>(key, (current) =>
        current && current.task.revision < saved.revision ? { ...current, task: saved } : current,
      );
      setDraft("");
      submitted.current = null;
      toast.show(t("Note added"), { variant: "success" });
      void invalidateCardViews(client);
      return true;
    } catch (e) {
      setError(message(e));
      void invalidateCardViews(client);
      return false;
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <View style={{ gap: space[2] }}>
      <SupplementList entries={task.supplements ?? empty} draft={draft} setDraft={(text) => {
        setDraft(text);
        setError("");
      }} add={add} disabled={!active || pending} readOnly={readOnly} />
      {!!error && <Notice>{error}</Notice>}
    </View>
  );
});
