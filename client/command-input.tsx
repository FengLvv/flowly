import { t } from "../shared/i18n";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ComponentProps } from "react";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { usePaseo } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { commandMatches, commandQuery, insertCommand, type ComposerCommand } from "../shared/composer-commands";
import { ComposerCommandMenu } from "./composer-commands";
import { message } from "./ui";

type Handle = { clear(): void; focus(): void; blur(): void };
type Props = ComponentProps<typeof TextInput> & { agentId: string; commandsEnabled: boolean; onNativeCommand?: (command: string) => void | Promise<void> };
/** Local keystroke state: suggestions must not re-render the conversation or feed text back to native. */
export const CommandInput = forwardRef<Handle, Props>(function CommandInput({ agentId, commandsEnabled, onNativeCommand, ...props }, forwarded) {
  const paseo = usePaseo(), input = useRef<Handle | null>(null);
  const [text, setText] = useState(String(props.value ?? props.defaultValue ?? ""));
  const [cursor, setCursor] = useState(text.length), [selected, setSelected] = useState(0), [dismissed, setDismissed] = useState(false);
  const [replacement, replace] = useState<{ seed: string; key: number } | null>(null);
  const skipSubmit = useRef(false), composing = useRef(false);
  const query = commandQuery(text, cursor), open = commandsEnabled && !dismissed && query !== null;
  const list = useQuery({ queryKey: ["flowly", "composer-commands", agentId], enabled: open, staleTime: 60000, gcTime: 60000,
    queryFn: async () => { const result = await paseo.agents.ref(agentId).commands(); if (result.error) throw new Error(result.error); return result.commands; }, refetchOnWindowFocus: false });
  const host: ComposerCommand[] = onNativeCommand ? [{ name: "exit", aliases: ["quit", "q"], description: t("Archive session"), argumentHint: "", hostOnly: true }, { name: "clear", aliases: ["new"], description: t("Archive this session and start a fresh draft."), argumentHint: "", hostOnly: true }] : [];
  const commands = commandMatches([...host, ...(list.data || []).filter(command => !host.some(h => h.name === command.name || h.aliases?.includes(command.name)))], query || "");
  const chosen = Math.min(selected, Math.max(0, commands.length - 1));
  useImperativeHandle(forwarded, () => ({ focus: () => input.current?.focus(), blur: () => input.current?.blur(), clear: () => { input.current?.clear(); setText(""); setCursor(0); setDismissed(false); } }), []);
  useEffect(() => { if (replacement) input.current?.focus(); }, [replacement?.key]);
  useEffect(() => { if (typeof props.value === "string") { setText(props.value); setCursor(old => Math.min(old, props.value!.length)); } }, [props.value]);
  const choose = (command: ComposerCommand) => {
    if (command.hostOnly && onNativeCommand) { setDismissed(true); void onNativeCommand(`/${command.name}`); return; }
    const next = insertCommand(text, command);
    setDismissed(true); setText(next); setCursor(next.length);
    replace(old => ({ seed: next, key: (old?.key || 0) + 1 }));
    props.onChangeText?.(next);
  };
  return <>
    <ComposerCommandMenu open={open} commands={commands} selected={chosen} loading={list.isPending} error={list.isError ? message(list.error) : ""} onRetry={() => void list.refetch()} onChoose={choose} />
    <TextInput {...props} ref={input as never} key={replacement?.key || 0}
      {...(props.value === undefined && replacement ? { defaultValue: replacement.seed } : {})}
      onChangeText={value => { setText(value); setCursor(value.length); setSelected(0); setDismissed(false); props.onChangeText?.(value); }}
      onSelectionChange={event => { setCursor(event.nativeEvent.selection.start); props.onSelectionChange?.(event); }}
      onKeyPress={event => {
        const key = event.nativeEvent.key, native = event.nativeEvent as typeof event.nativeEvent & { isComposing?: boolean; keyCode?: number; shiftKey?: boolean };
        composing.current = !!native.isComposing || native.keyCode === 229 || key === "Process";
        if (composing.current) return;
        if (key === "Enter" && native.shiftKey) { skipSubmit.current = false; props.onKeyPress?.(event); return; }
        if (open && ["ArrowDown", "ArrowUp", "Escape", "Enter", "Tab"].includes(key)) {
          if (key === "Escape" || key === "Enter" || (commands.length && ["ArrowDown", "ArrowUp", "Enter", "Tab"].includes(key))) {
            event.preventDefault(); skipSubmit.current = key === "Enter";
            if (key === "Escape") setDismissed(true);
            else if (key === "ArrowDown") setSelected((chosen + 1) % commands.length);
            else if (key === "ArrowUp") setSelected((chosen + commands.length - 1) % commands.length);
            else if (commands.length) choose(commands[chosen]);
            return;
          }
        }
        skipSubmit.current = false;
        props.onKeyPress?.(event);
      }}
      onSubmitEditing={event => { if (skipSubmit.current || composing.current) { skipSubmit.current = false; return; } props.onSubmitEditing?.(event); }}
    />
  </>;
});
