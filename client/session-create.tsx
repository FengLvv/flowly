import { hasInstruction, instructionText } from "../shared/description-images";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Modal } from "./modal";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import type { Task } from "../shared/model";
import type { ToolPreparation } from "../shared/tools";
import * as rpc from "../shared/rpc";
import { createPreparedSession } from "./session";
import { Theme, useTheme, Button, Label, Field, Choices, Notice, Actions, message, font, radius, space } from "./ui";
import { AgentPicker, useAgentChoice } from "./agent-choice";
import { Pressable } from "react-native";
import { t } from "../shared/i18n";
import { ImageAttachments, useImageAttachments } from "./image-attach";
import { newMessageId, rememberSentImages } from "./sent-images";
import { PickerGroup, PickerRow } from "./picker";

export function SessionCreate({
  task,
  open,
  workspaceDirectory,
  unavailable,
  onClose,
  onCreated,
  refresh,
  defaults,
  seed,
}: {
  task: Task;
  open: boolean;
  /** Prefill for a session started from an idea (IDEAS-SPEC §6.3); read when the form opens. */
  seed?: { title: string; prompt: string } | null;
  /** Provider/model/mode of the latest session, reused as this form's starting point. */
  defaults?: { provider: string; model: string; mode: string } | null;
  workspaceDirectory?: string;
  unavailable: boolean;
  onClose(): void;
  onCreated(id: string, feedback: string): void;
  refresh(): void;
}) {
  const theme = useTheme();
  const paseo = usePaseo(),
    contextRead = useRpc(rpc.taskContext),
    prepare = useRpc(rpc.prepareSession),
    healthRead = useRpc(rpc.toolsHealth),
    sourcesRead = useRpc(rpc.sessionContextSources),
    dialogueRead = useRpc(rpc.sessionContextRead),
    readDescription = useRpc(rpc.readDescriptionImages);
  const [contextSource, setContextSource] = useState("");
  const [sourcePicker, setSourcePicker] = useState(false);
  const sources = useQuery({
    queryKey: ["flowly", "session-context-sources", task.id],
    queryFn: () => sourcesRead({ taskId: task.id }),
    enabled: open && sourcePicker,
    staleTime: 0,
  });
  const choice = useAgentChoice({ enabled: open, cwd: workspaceDirectory, defaults });
  const { provider, chosenModel, chosenMode, providers, models, modes } = choice;
  const [newTitle, setTitle] = useState(""),
    [newPrompt, setPrompt] = useState(""),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [creationPending, setCreationPending] = useState(false);
  // Images with the first message (web: paste, drop or Add images).
  const attachments = useImageAttachments();
  const [descriptionRevision, setDescriptionRevision] = useState<number>();
  const [loadingDescription, setLoadingDescription] = useState(false);
  async function useDescription() {
    setLoadingDescription(true);
    setError("");
    try {
      const source = await readDescription({ taskId: task.id, revision: task.revision });
      attachments.replace(source.images.map((image) => ({ ...image, uri: `data:${image.mimeType};base64,${image.data}` })));
      setPrompt(source.description);
      setDescriptionRevision(source.revision);
    } catch (e) { setError(message(e)); refresh(); }
    finally { setLoadingDescription(false); }
  }
  // Reset each time the form opens. The instruction starts empty: the task's
  // title and description already reach the session as its work instructions.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      choice.reset(defaults);
      setPrompt(seed?.prompt || "");
      setTitle(seed?.title || "");
      setContextSource("");
      setSourcePicker(false);
      attachments.clear();
      setDescriptionRevision(undefined);
      setError("");
    }
    wasOpen.current = open;
  }, [open]);
  const attempt = useRef<
    | { operationId: string; messageId: string; fingerprint: string; prepared?: ToolPreparation }
    | undefined
  >(undefined);
  const lock = useRef(false);
  const tools = useQuery({
    queryKey: ["flowly", "tools"],
    queryFn: () => healthRead({}),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });
  const canCreate =
    !sending && !loadingDescription &&
    !unavailable &&
    choice.ready &&
    hasInstruction(newPrompt, attachments.attachments);
  async function perform(action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setSending(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      lock.current = false;
      setSending(false);
    }
  }
  async function createSession(ordinary = false) {
    await perform(async () => {
      const chosen = chosenModel;
      if (!chosen) throw new Error(t("Choose an available model."));
      const latestScope = await contextRead({ id: task.id });
      if (!latestScope.available) throw new Error(latestScope.reason);
      const fingerprint = JSON.stringify([
        provider,
        chosen,
        chosenMode,
        choice.chosenThinking,
        newTitle,
        newPrompt,
        ordinary,
        contextSource,
        attachments.images(),
        descriptionRevision,
      ]);
      if (attempt.current?.prepared) {
        const existing = await paseo.agents
          .ref(attempt.current.prepared.agentId)
          .refresh();
        if (existing?.agent) {
          if (
            existing.agent.workspaceId !== task.workspaceId ||
            existing.agent.archivedAt
          )
            throw new Error(
              t("Prepared session is unavailable or belongs to a different workspace."),
            );
          onCreated(
            existing.agent.id,
            t("Recovered the existing session. Its initial instruction was not sent again; check its output before continuing."),
          );
          onClose();
          attempt.current = undefined;
          setCreationPending(false);
          refresh();
          return;
        }
      }
      if (descriptionRevision !== undefined && latestScope.revision !== descriptionRevision)
        throw new Error(t("Description changed. Use card description again."));
      if (!attempt.current || attempt.current.fingerprint !== fingerprint)
        attempt.current = {
          operationId: `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          messageId: newMessageId(),
          fingerprint,
        };
      const images = attachments.images();
      const imageUris = attachments.uris();
      const messageId = attempt.current.messageId;
      // Do not read/copy any source configuration. Target work instructions
      // and freshly prepared identity remain authoritative for this session.
      const dialogue = contextSource ? await dialogueRead({ taskId: task.id, agentId: contextSource }) : undefined;
      const preparation = ordinary
        ? undefined
        : await prepare({
            id: task.id,
            operationId: attempt.current.operationId,
          });
      if (preparation) {
        attempt.current.prepared = preparation;
        setCreationPending(true);
      }
      const options = {
        config: {
          provider: `${provider}/${chosen}`,
          systemPrompt: preparation?.instructions || latestScope.context,
          ...(chosenMode ? { modeId: chosenMode } : {}),
          ...(choice.chosenThinking ? { thinkingOptionId: choice.chosenThinking } : {}),
        },
        ...(preparation
          ? {
              agentId: preparation.agentId,
              idempotencyKey: `ultra-kanban-session:${preparation.agentId}`,
              env: {
                FLOWLY_CONTEXT_FILE: preparation.contextFile,
                FLOWLY_CLI: preparation.cliPath,
                FLOWLY_SKILL: preparation.skillPath,
              },
            }
          : { idempotencyKey: attempt.current.operationId }),
        title: newTitle.trim() || task.title,
        labels: { "flowly-task": task.id },
        prompt: instructionText(newPrompt, task.title, images),
        ...(dialogue ? { attachments: [{ type: "text" as const, mimeType: "text/plain" as const, title: dialogue.title, text: dialogue.text }] } : {}),
        ...(images.length ? { images, clientMessageId: messageId } : {}),
      };
      const created = preparation
        ? await createPreparedSession(paseo, task.workspaceId, {
            ...options,
            agentId: preparation.agentId,
          })
        : await paseo.workspaces.ref(task.workspaceId).agents.create(options);
      if (images.length) rememberSentImages(messageId, imageUris);
      attachments.clear();
      onCreated(
        created.id,
        "recovered" in created && created.recovered
          ? t("Session exists after a partial creation response. Check its output before sending more instructions.")
          : ordinary
            ? t("Ordinary session created. Select it to send Kanban instructions later.")
            : t("Kanban configuration provided. Successful tool calls will be shown separately."),
      );
      attempt.current = undefined;
      setCreationPending(false);
      onClose();
      setPrompt("");
      setTitle("");
      refresh();
    });
  }
  // Enter submits, Shift+Enter is a new line.
  const submit = canCreate && tools.data?.ready ? () => void createSession() : undefined;
  return (
    <Modal
      open={open}
      title={t("New session")}
      onOpenChange={(next) => {
        if (!next && !lock.current && !loadingDescription) onClose();
      }}
    >
      <Modal.Content>
        <Theme.Provider value={theme}>
        <Field
          title={t("Session title (optional)")}
          value={newTitle}
          onChange={setTitle}
          placeholder={task.title}
          editable={!sending}
          onSubmit={submit}
        />
        {(task.description.trim() || task.descriptionImages?.length) ? <Button quiet disabled={sending || loadingDescription} onPress={() => void useDescription()}>{t("Use card description")}</Button> : null}
        <ImageAttachments state={attachments} disabled={sending || loadingDescription}>
          <Field
            title={t("Instruction")}
            value={newPrompt}
            onChange={setPrompt}
            multiline
            placeholder={t("What should this session do first?")}
            editable={!sending && !loadingDescription}
            onSubmit={submit}
          />
        </ImageAttachments>
        <AgentPicker choice={choice} disabled={sending} />
        <PickerGroup>
          <PickerRow
            first title={t("Context from")} icon="MessagesSquare"
            value={contextSource} placeholder={contextSource || t("None")}
            open={sourcePicker} disabled={sending} loading={sources.isFetching}
            options={[{ value: "", label: t("None") }, ...(sources.data?.entries || []).map((s) => ({ value: s.id, label: `${s.title} · ${s.workspaceName}` }))]}
            onToggle={() => setSourcePicker(!sourcePicker)}
            onChange={(id) => { setContextSource(id); setSourcePicker(false); setError(""); }}
          />
        </PickerGroup>
        {contextSource && <Label muted size={font.sm}>{t("Recent dialogue text only, up to 60,000 characters. Images and tool results are excluded.")}</Label>}
        {sourcePicker && sources.error && <Notice>{message(sources.error)}</Notice>}
        <Label muted size={font.sm}>
          {t("The task's title and description are included automatically, along with Kanban tools.")}</Label>
        {providers.isSuccess &&
          !providers.data?.providers.some((p) => p.available) && (
            <Notice>
              {t("No providers are available. Configure a provider in Paseo to create a session.")}</Notice>
          )}
        {providers.isSuccess &&
          providers.data?.providers.some((p) => p.available) &&
          !providers.data?.providers.some(
            (p) => p.available && p.provider === provider,
          ) && (
            <Notice>{t("Choose an available provider.")}</Notice>
          )}
        {models.isSuccess &&
          !(models.data?.models || []).some(
            (m) => m.isSelectable !== false,
          ) && (
            <Notice>
              {t("No selectable models are available for this provider.")}</Notice>
          )}
        {(models.error || modes.error || providers.error) && (
          <Notice>
            {message(models.error || modes.error || providers.error)}
          </Notice>
        )}
        {(!tools.data?.ready || tools.error) && (
          <Notice tone={tools.error ? "danger" : "warning"}>
            {tools.error
              ? message(tools.error)
              : tools.data?.reason || t("Checking Kanban tools…")}
          </Notice>
        )}
        {creationPending && (
          <Notice tone="info">
            {t("A session ID is prepared. Retry checks for an existing session before creating it.")}</Notice>
        )}
        {error && <Notice>{error}</Notice>}
        <Actions>
          {!tools.data?.ready && (
            <Button
              disabled={!canCreate}
              onPress={() => void createSession(true)}
            >
              {t("Create ordinary session")}</Button>
          )}
          <Button quiet disabled={sending || loadingDescription} onPress={onClose}>
            {t("Cancel")}</Button>
          <Button
            primary
            disabled={!submit}
            onPress={() => void createSession()}
          >
            {sending ? t("Creating…") : t("Create session")}
          </Button>
        </Actions>
        </Theme.Provider>
      </Modal.Content>
    </Modal>
  );
}
