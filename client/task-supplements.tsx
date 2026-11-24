import { memo, useImperativeHandle, useRef, useState, type Ref } from "react";
import { View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@getpaseo/plugin/client/react-native";
import type { CardDetail } from "../shared/card-detail";
import { t } from "../shared/i18n";
import type { Task } from "../shared/model";
import { appendTaskSupplement, updateTask } from "../shared/rpc";
import { taskSupplementLimits, type TaskSupplement } from "../shared/task-supplements";
import { detailKey, invalidateCardViews, useTaskDetail } from "./card-detail-query";
import { DescriptionImages, ImagePreview } from "./description-images";
import { ImageAttachments, useImageAttachments } from "./image-attach";
import { Enter } from "./motion";
import { newMessageId } from "./sent-images";
import { Button, Field, IconButton, Label, Notice, font, message, space } from "./ui";
import type { Attachment } from "./web-images";

const empty: TaskSupplement[] = [];
export type SupplementItem = TaskSupplement & { attachments?: Attachment[] };
export type SupplementDraftReader = () => SupplementItem;

export function hasNoteContent(entry: SupplementItem) {
  return !!entry.text.trim() || !!entry.images?.length || !!entry.attachments?.length;
}

export function newSupplementInput(entry: SupplementItem) {
  return {
    id: entry.id,
    text: entry.text.trim(),
    images: entry.attachments?.map(({ data, mimeType, name }) => ({ data, mimeType, name })),
  };
}

export function supplementInput(entry: SupplementItem) {
  const draft = newSupplementInput(entry);
  return { ...draft, images: [...(entry.images ?? []).map(({ id }) => ({ id })), ...(draft.images ?? [])] };
}

function sameImages(a: readonly { id: string }[] = [], b: readonly { id: string }[] = []) {
  return a.length === b.length && a.every(({ id }, index) => id === b[index].id);
}

function SupplementEditor({ entry, task, adding, disabled, draftRef, save, cancel }: {
  entry: SupplementItem;
  task?: Task;
  adding: boolean;
  disabled: boolean;
  draftRef?: Ref<SupplementDraftReader>;
  save(value: SupplementItem): Promise<void>;
  cancel(): void;
}) {
  const [text, setText] = useState(entry.text);
  const [images, setImages] = useState(entry.images);
  const attachments = useImageAttachments(entry.attachments);
  const locked = disabled || attachments.reading;
  const draft = (): SupplementItem => ({ id: entry.id, text, images, attachments: attachments.getAttachments() });
  useImperativeHandle(draftRef, () => () => {
    if (attachments.isReading()) throw new Error(t("Loading…"));
    return draft();
  });
  const canSave = !locked && hasNoteContent(draft());
  function submit() {
    if (canSave && !attachments.isReading()) void save(draft());
  }
  return (
    <Enter distance={3}>
      <ImageAttachments compact state={attachments} disabled={disabled}
        trailingAction={<View style={{ flexDirection: "row", gap: space[1], alignItems: "center" }}>
          <Button small disabled={!canSave} onPress={submit}>{adding ? t("Add") : t("Save")}</Button>
          <IconButton icon="X" label={t("Cancel")} disabled={disabled} onPress={cancel} />
        </View>}>
        <Field title={t("Supplemental notes")} hideTitle value={text} onChange={setText}
          maxLength={taskSupplementLimits.text} editable={!disabled}
          multiline={entry.text.includes("\n")} autoFocus onSubmit={submit} />
        {task && !!images?.length && <DescriptionImages task={task} supplementId={entry.id} images={images}
          onRemove={disabled ? undefined : (id) => setImages((current) => current?.filter((image) => image.id !== id))} />}
      </ImageAttachments>
    </Enter>
  );
}

export function SupplementList({ task, entries, save, remove, disabled, readOnly = false, draftRef }: {
  task?: Task;
  entries: readonly SupplementItem[];
  save(entry: SupplementItem, original?: SupplementItem): boolean | Promise<boolean>;
  remove(id: string): void;
  disabled: boolean;
  readOnly?: boolean;
  draftRef?: Ref<SupplementDraftReader>;
}) {
  const [editor, setEditor] = useState<{ entry: SupplementItem; adding: boolean }>();
  const full = entries.length >= taskSupplementLimits.perTask;
  if (readOnly && !entries.length) return null;
  const active = !readOnly ? editor : undefined;
  const editing = active && !active.adding ? active.entry : undefined;
  // Keep an open edit mounted if another client deletes its entry.
  const visible = editing && !entries.some(({ id }) => id === editing.id) ? [...entries, editing] : entries;
  const renderEditor = (opened: NonNullable<typeof active>) => (
    <SupplementEditor task={task} entry={opened.entry} adding={opened.adding} draftRef={draftRef}
      disabled={disabled} cancel={() => setEditor(undefined)} save={async (value) => {
        if (await save(value, opened.adding ? undefined : opened.entry)) setEditor(undefined);
      }} />
  );
  return (
    <View style={{ gap: space[2] }}>
      <Label medium size={font.sm} muted>{t("Supplemental notes")}</Label>
      {visible.map((entry) => (
        <View key={entry.id}>
          {active && entry.id === editing?.id ? renderEditor(active) : (
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[2] }}>
              <Label muted>•</Label>
              <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
                {!!entry.text && <Label selectable>{entry.text}</Label>}
                {task && !!entry.images?.length && <DescriptionImages task={task} supplementId={entry.id} images={entry.images} />}
                {!!entry.attachments?.length && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
                  {entry.attachments.map((image) => <ImagePreview key={image.id} uri={image.uri} name={image.name} small />)}
                </View>}
              </View>
              {!readOnly && <>
                <IconButton icon="Pencil" label={t("Edit note")} disabled={disabled || !!active}
                  onPress={() => setEditor({ entry, adding: false })} />
                <IconButton icon="X" label={t("Remove note")} disabled={disabled} onPress={() => remove(entry.id)} />
              </>}
            </View>
          )}
        </View>
      ))}
      {active?.adding && renderEditor(active)}
      {!readOnly && !active && (
        <View style={{ alignSelf: "flex-start" }}>
          <Button small icon="Plus" disabled={disabled || full}
            onPress={() => setEditor({ entry: { id: newMessageId(), text: "" }, adding: true })}>{t("Add note")}</Button>
        </View>
      )}
      {!readOnly && full && <Label muted size={font.sm}>{t("You can add up to {count} supplemental notes.", { count: taskSupplementLimits.perTask })}</Label>}
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
  const append = useRpc(appendTaskSupplement);
  const update = useRpc(updateTask);
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitted = useRef<{ draft: SupplementItem; id: string } | null>(null);
  const lock = useRef(false);
  const entries = task.supplements ?? empty;
  async function persist(write: () => Promise<Task>, success: string) {
    if (!active || readOnly || lock.current) return false;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      const saved = await write();
      const key = detailKey(hostId, saved.id, saved.workspaceId);
      await client.cancelQueries({ queryKey: key, exact: true });
      client.setQueryData<CardDetail>(key, (current) =>
        current && current.task.revision < saved.revision ? { ...current, task: saved } : current,
      );
      toast.show(success, { variant: "success" });
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
  async function add(entry: SupplementItem) {
    const previous = submitted.current;
    const sameEditor = previous?.draft.id === entry.id;
    const retry = sameEditor && previous.draft.text === entry.text && sameImages(previous.draft.attachments, entry.attachments);
    const id = retry ? previous.id : sameEditor ? newMessageId() : entry.id;
    const saved = await persist(() => {
      submitted.current = { draft: entry, id };
      return append({ taskId: task.id, entry: { ...newSupplementInput(entry), id } });
    }, t("Note added"));
    if (saved) submitted.current = null;
    return saved;
  }
  function save(entry: SupplementItem, original?: SupplementItem) {
    if (!original) return add(entry);
    return persist(() => {
      const current = entries.find(({ id }) => id === original.id);
      if (!current || current.text !== original.text || !sameImages(current.images, original.images))
        throw new Error(t("This note changed. Reopen it before saving."));
      const supplements = entries.map((item) => supplementInput(item.id === entry.id ? entry : item));
      return update({ id: task.id, revision: task.revision, supplements });
    }, t("Note updated"));
  }
  function remove(id: string) {
    const remaining = entries.filter((entry) => entry.id !== id);
    if (remaining.length === entries.length) return;
    void persist(() => update({ id: task.id, revision: task.revision, supplements: remaining.map(supplementInput) }), t("Note removed"));
  }
  return (
    <View style={{ gap: space[2] }}>
      <SupplementList task={task} entries={entries} save={save} remove={remove} disabled={!active || pending} readOnly={readOnly} />
      {!!error && <Notice>{error}</Notice>}
    </View>
  );
});
