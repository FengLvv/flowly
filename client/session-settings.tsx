import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { Icon, ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import type { PaseoAgent } from "@getpaseo/client";
import * as rpc from "../shared/rpc";
import { Label, font, message, noFocusRing, radius, space, tint, touch, useTheme } from "./ui";
import { useMotionPresence, lerp } from "./motion";
import { t } from "../shared/i18n";

type Feature = NonNullable<PaseoAgent["features"]>[number];
/** Composer popups; "subagents" is the Subagents chip (SUBAGENTS-SPEC). */
export type ChipMenuId = "model" | "thinking" | "mode" | "subagents";

const featureValue = (f: Feature) =>
  f.type === "toggle"
    ? f.value
      ? t("On")
      : t("Off")
    : f.options.find((o) => o.id === f.value)?.label || f.value || t("Default");

/**
 * Session configuration for the composer chips. Reasoning / permissions / stop
 * go through the plugin daemon; model/features use the approved server adapter.
 */
export function useSessionConfig(taskId: string, agent: PaseoAgent | undefined, enabled: boolean, onChanged: () => void | Promise<unknown>, operation: {
  canWrite: boolean;
  begin(id: string): boolean;
  end(id: string): void;
}) {
  const paseo = usePaseo(),
    configure = useRpc(rpc.configureSession),
    toast = useToast();
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const target = useRef(agent?.id);
  target.current = enabled ? agent?.id : undefined;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const models = useQuery({
    queryKey: ["flowly", "models", agent?.provider, agent?.cwd],
    queryFn: async () => {
      const result = await paseo.providers.listModels(agent!.provider, { cwd: agent!.cwd });
      if (result.error) throw new Error(result.error);
      return result;
    },
    enabled: enabled && !!agent,
    staleTime: 60000,
  });
  const model = models.data?.models?.find((m) => m.id === agent?.model || m.aliases?.includes(agent?.model || ""));
  const thinking = model?.thinkingOptions || [];
  const currentThinking = agent?.thinkingOptionId || model?.defaultThinkingOptionId || "";
  async function apply(change: { modelId?: string; feature?: { id: string; value: boolean | string }; thinkingOptionId?: string; modeId?: string; stop?: boolean; title?: string }, done: string) {
    if (!agent || !enabled || target.current !== agent.id || !operation.canWrite || locked.current || !operation.begin(agent.id)) return false;
    const id = agent.id;
    locked.current = true;
    setPending(true);
    try {
      await configure({ taskId, agentId: id, ...change });
      if (mounted.current && target.current === id) toast.show(done, { variant: "success" });
      return true;
    } catch (e) {
      if (mounted.current && target.current === id) toast.error(message(e));
      return false;
    } finally {
      // A provider can reject after partly applying a setting: always read back.
      try { if (mounted.current && target.current === id) await onChanged(); }
      finally {
        operation.end(id);
        locked.current = false;
        if (mounted.current) setPending(false);
      }
    }
  }
  return {
    modelLabel: model?.label || agent?.model || t("Default model"),
    modelId: model?.id || agent?.model || "",
    models: (models.data?.models || []).filter((m) => m.isSelectable !== false),
    modelsLoading: models.isPending,
    modelsError: models.isError ? message(models.error) : "",
    retryModels: () => void models.refetch(),
    pending,
    features: agent?.features || [],
    thinking,
    currentThinking,
    thinkingLabel: thinking.find((t) => t.id === currentThinking)?.label || "",
    modes: agent?.availableModes || [],
    modeLabel: agent?.availableModes?.find((m) => m.id === agent.currentModeId)?.label || "",
    currentMode: agent?.currentModeId || "",
    defaultThinking: model?.defaultThinkingOptionId,
    apply,
  };
}
export type SessionConfig = ReturnType<typeof useSessionConfig>;

function Chip({ icon, text, open, disabled, onPress, label }: {
  icon: string;
  text: string;
  open: boolean;
  disabled?: boolean;
  onPress(): void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open, disabled: !!disabled }}
 disabled={disabled}
      onPress={onPress}
      style={(state) => {
        const { pressed, hovered: hover, focused } = state as typeof state & { hovered?: boolean; focused?: boolean };
        return {
          ...noFocusRing,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          height: touch ? 32 : 26,
          maxWidth: 180,
          paddingHorizontal: space[2],
          borderRadius: radius.md,
          backgroundColor: open || hover || pressed ? colors.surface2 : "transparent",
          opacity: disabled ? 0.5 : 1,
        };
      }}
    >
      <Icon name={icon} size={13} color={colors.foregroundMuted} />
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Label size={font.sm} medium lines={1} selectable={false}>
          {text}
        </Label>
      </View>
      <Icon name="ChevronDown" size={12} color={colors.foregroundMuted} />
    </Pressable>
  );
}

type MenuItem = { id: string; label: string; detail?: string; badge?: string; selected?: boolean; disabled?: boolean; onPress?(): void };

/** Floating (desktop) or inline (sheet) menu with a short fade/rise. */
export function ChipMenu({ open, items, inline, footer }: { open: boolean; items: MenuItem[]; inline: boolean; footer?: ReactNode }) {
  const { colors } = useTheme();
  const presence = useMotionPresence(open ? true : undefined, open ? "menu" : "");
  if (!presence.item) return null;
  return (
    <Animated.View
      pointerEvents={presence.active ? "auto" : "none"}
      style={[
        inline
          ? { marginTop: space[1] }
          : { position: "absolute", left: 0, bottom: "100%", marginBottom: 6, minWidth: 240, maxWidth: 320, zIndex: 30 },
        {
          padding: 4,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface0,
          shadowColor: "#000",
          shadowOpacity: inline ? 0 : 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          opacity: presence.progress,
          transform: [{ translateY: lerp(presence.progress, [6, 0]) }],
        },
      ]}
    >
      <ScrollView style={{ maxHeight: inline ? 240 : 320 }} keyboardShouldPersistTaps="handled">
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: !!item.selected, disabled: !!item.disabled }}
          disabled={item.disabled || !item.onPress}
          onPress={item.onPress}
          style={(state) => {
            const { pressed, hovered: hover, focused } = state as typeof state & { hovered?: boolean; focused?: boolean };
            return {
              ...noFocusRing,
              flexDirection: "row",
              alignItems: "center",
              gap: space[2],
              minHeight: touch ? 44 : item.detail ? 40 : 30,
              paddingHorizontal: space[2] + 2,
              paddingVertical: 4,
              borderRadius: radius.md,
              backgroundColor: item.selected ? tint(colors.accent, 0.08) : hover || pressed ? colors.surface1 : "transparent",
              opacity: item.disabled ? 0.5 : 1,
            };
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5] }}>
              <Label size={font.md} medium={item.selected} lines={1} selectable={false}>{item.label}</Label>
              {!!item.badge && <Label muted size={font.xs} selectable={false}>{item.badge}</Label>}
            </View>
            {!!item.detail && <Label muted size={font.xs} lines={2} selectable={false}>{item.detail}</Label>}
          </View>
          {item.selected && <Icon name="Check" size={14} color={colors.accent} />}
        </Pressable>
      ))}
      </ScrollView>
      {footer}
    </Animated.View>
  );
}

/** Model · Reasoning · Permissions chips under the composer (Paseo layout). */
export function ComposerChips({
  config,
  menu,
  setMenu,
  inline,
  disabled,
  onOpenInPaseo,
}: {
  config: SessionConfig;
  menu: ChipMenuId | null;
  setMenu(menu: ChipMenuId | null): void;
  inline: boolean;
  disabled: boolean;
  onOpenInPaseo?: () => void;
}) {
  const { colors } = useTheme();
  const [featureMenu, setFeatureMenu] = useState<string | null>(null);
  useEffect(() => { if (menu !== "model") setFeatureMenu(null); }, [menu]);
  const blocked = disabled || config.pending;
  const feature = config.features.find((f) => f.id === featureMenu);
  const chooseFeature = (id: string, value: boolean | string) => {
    setMenu(null);
    setFeatureMenu(null);
    void config.apply({ feature: { id, value } }, t("Session settings updated"));
  };
  const toggle = (id: ChipMenuId) => { setFeatureMenu(null); setMenu(menu === id ? null : id); };
  const fast = config.features.filter((f) => f.type === "toggle" && f.value);
  const menuFor = (id: ChipMenuId) =>
    id === "model" ? (
      <ChipMenu
        open={menu === "model"}
        inline={inline}
        items={feature?.type === "select" ? [
          { id: "back", label: t("Back"), onPress: () => setFeatureMenu(null) },
          ...feature.options.map((option) => ({
            id: option.id, label: option.label, detail: option.description, selected: option.id === feature.value, disabled: blocked,
            onPress: () => { if (option.id !== feature.value) chooseFeature(feature.id, option.id); },
          })),
        ] : [
          ...(!config.models.some((m) => m.id === config.modelId) ? [{ id: "current", label: config.modelLabel, detail: t("Current model"), selected: true }] : []),
          ...config.models.map((m) => ({
            id: `model:${m.id}`, label: m.label, detail: m.description, selected: m.id === config.modelId, disabled: blocked || config.modelsLoading || !!config.modelsError,
            onPress: () => {
              setMenu(null);
              if (m.id !== config.modelId) void config.apply({ modelId: m.id }, t("Model: {modelLabel}", { modelLabel: m.label }));
            },
          })),
          ...config.features.map((f) => ({ id: `feature:${f.id}`, label: f.label, detail: featureValue(f), disabled: blocked,
            onPress: () => f.type === "toggle" ? chooseFeature(f.id, !f.value) : setFeatureMenu(f.id),
          })),
        ]}
        footer={
          <View style={{ padding: space[2], gap: space[1.5], borderTopWidth: 1, borderColor: colors.border, marginTop: 4 }}>
            {config.modelsLoading && <Label muted size={font.xs}>{t("Loading models…")}</Label>}
            {!!config.modelsError && <>
              <Label size={font.xs} color={colors.statusDanger}>{config.modelsError}</Label>
              <Pressable accessibilityRole="button" style={noFocusRing} onPress={config.retryModels}><Label size={font.sm} color={colors.accent}>{t("Retry")}</Label></Pressable>
            </>}
            {!config.modelsLoading && !config.modelsError && !config.models.length && <Label muted size={font.xs}>{t("No selectable models are available for this provider.")}</Label>}
            {onOpenInPaseo && (
              <Pressable accessibilityRole="button" onPress={onOpenInPaseo} style={{ ...noFocusRing, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon name="ArrowUpRight" size={13} color={colors.accent} />
                <Label size={font.sm} medium color={colors.accent} selectable={false}>{t("Open in Paseo")}</Label>
              </Pressable>
            )}
          </View>
        }
      />
    ) : id === "thinking" ? (
      <ChipMenu
        open={menu === "thinking"}
        inline={inline}
        items={config.thinking.map((level) => ({
          id: level.id,
          label: level.label,
          detail: level.description,
          badge: level.id === config.defaultThinking ? t("Default") : undefined,
          selected: level.id === config.currentThinking,
          disabled: blocked,
          onPress: () => {
            setMenu(null);
            if (level.id !== config.currentThinking) void config.apply({ thinkingOptionId: level.id }, t("Reasoning: {label}", { label: level.label }));
          },
        }))}
      />
    ) : (
      <ChipMenu
        open={menu === "mode"}
        inline={inline}
        items={config.modes.map((m) => ({
          id: m.id,
          label: m.label,
          detail: m.description,
          selected: m.id === config.currentMode,
          disabled: blocked,
          onPress: () => {
            setMenu(null);
            if (m.id !== config.currentMode) void config.apply({ modeId: m.id }, t("Permissions: {label}", { label: m.label }));
          },
        }))}
      />
    );
  const chip = (id: ChipMenuId, node: ReactNode) => (
    <View key={id} style={{ position: "relative" }}>
      {!inline && menuFor(id)}
      {node}
    </View>
  );
  return (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 2 }}>
        {chip("model", (
          <Chip icon="Cpu" text={`${config.modelLabel}${fast.length ? ` · ${fast.map((f) => f.label).join(", ")}` : ""}`} label={t("Model: {modelLabel}", { modelLabel: config.modelLabel })} open={menu === "model"} disabled={blocked} onPress={() => toggle("model")} />
        ))}
        {config.thinking.length > 0 &&
          chip("thinking", (
            <Chip icon="Brain" text={config.thinkingLabel || t("Reasoning")} label={t("Reasoning: {label}", { label: config.thinkingLabel || t("default") })} open={menu === "thinking"} disabled={blocked} onPress={() => toggle("thinking")} />
          ))}
        {config.modes.length > 0 &&
          chip("mode", (
            <Chip icon="ShieldCheck" text={config.modeLabel || t("Permissions")} label={t("Permissions: {label}", { label: config.modeLabel || t("default") })} open={menu === "mode"} disabled={blocked} onPress={() => toggle("mode")} />
          ))}
      </View>
      {inline && menu && menuFor(menu)}
    </View>
  );
}
