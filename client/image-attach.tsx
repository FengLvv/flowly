import { ImagePreview } from "./description-images";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { Button, Label, font, message, noFocusRing, radius, space, useTheme } from "./ui";
import { Enter } from "./motion";
import { imageInputSupported, listenForImages, pickImageFiles, readImages, type Attachment } from "./web-images";
import { maxImages, type OutgoingImage } from "../shared/composer";
import { t } from "../shared/i18n";

/** An image waiting to be sent: thumbnail with a remove button. */
export function AttachmentThumb({ attachment, onRemove }: { attachment: Attachment; onRemove(): void }) {
  const { colors } = useTheme();
  return (
    <Enter distance={4}>
      <View style={{ width: 52, height: 52 }}>
        <ImagePreview uri={attachment.uri} name={attachment.name} small />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Remove {name}", { name: attachment.name })}
          onPress={onRemove}
          hitSlop={6}
          style={{
            ...noFocusRing,
            position: "absolute",
            top: -5,
            right: -5,
            width: 18,
            height: 18,
            borderRadius: 9,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.foreground,
            borderWidth: 1.5,
            borderColor: colors.surface0,
          }}
        >
          <Icon name="X" size={10} color={colors.surface0} />
        </Pressable>
      </View>
    </Enter>
  );
}

/**
 * Images for a first message (New task's agent, New session). Web only: paste,
 * drop or the file chooser (`client/web-images.ts`); phones have no
 * plugin-accessible picker (user decision 2026-10-21, SESSION-PANE-SPEC §6).
 */
export function useImageAttachments(limit = maxImages) {
  const toast = useToast();
  const [attachments, setState] = useState<Attachment[]>([]);
  const current = useRef<Attachment[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const set = (next: Attachment[]) => {
    current.current = next;
    setState(next);
  };
  const add = async (files: Parameters<typeof readImages>[0]) => {
    if (!files.length) return;
    try {
      const { images, problems } = await readImages(files, limit - current.current.length);
      if (!alive.current) return;
      if (images.length && images.length + current.current.length <= limit) set([...current.current, ...images]);
      else if (images.length) toast.error(t("At most {maxImages} images per message.", { maxImages }));
      if (problems.length) toast.error(problems.join(" "));
    } catch (e) {
      toast.error(message(e));
    }
  };
  const latestAdd = useRef(add);
  latestAdd.current = add;
  return {
    attachments,
    /** What the SDK sends. */
    images: (): OutgoingImage[] => current.current.map(({ data, mimeType }) => ({ data, mimeType })),
    uris: () => current.current.map((a) => a.uri),
    add: (files: Parameters<typeof readImages>[0]) => latestAdd.current(files),
    remove: (id: string) => set(current.current.filter((a) => a.id !== id)),
    clear: () => set([]),
    replace: (images: readonly Attachment[]) => {
      if (images.length > limit) throw new Error(t("At most {maxImages} images per message.", { maxImages }));
      set(images.map((image) => ({ ...image })));
    },
    full: attachments.length >= limit,
  };
}

/**
 * Wraps a message field: pasted or dropped images on it are attached, and an
 * "Add images" button with the thumbnails sits below. Renders only the field
 * where image input is unsupported (phones), plus any supplied trailing action.
 */
export function ImageAttachments({
  state,
  disabled,
  trailingAction,
  children,
}: {
  state: ReturnType<typeof useImageAttachments>;
  disabled?: boolean;
  trailingAction?: ReactNode;
  children: ReactNode;
}) {
  const [node, setNode] = useState<View | null>(null);
  const add = useRef(state.add);
  add.current = state.add;
  const blocked = useRef(disabled);
  blocked.current = disabled;
  useEffect(() => listenForImages(node, (files) => !blocked.current && void add.current(files)), [node]);
  const full = state.full;
  return (
    <View ref={setNode} style={{ gap: space[2] }}>
      {children}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", flexGrow: 1, flexShrink: 1, gap: space[2] }}>
          {state.attachments.map((a) => (
            <AttachmentThumb key={a.id} attachment={a} onRemove={() => !disabled && state.remove(a.id)} />
          ))}
          {imageInputSupported && <Button quiet icon="ImagePlus" disabled={disabled || full} onPress={() => void pickImageFiles().then((files) => state.add(files))}>
            {t("Add images")}
          </Button>}
          {imageInputSupported && !state.attachments.length && (
            <Label muted size={font.sm}>
              {t("or paste or drop them here")}
            </Label>
          )}
        </View>
        {trailingAction && <View style={{ marginLeft: "auto", maxWidth: "100%" }}>{trailingAction}</View>}
      </View>
    </View>
  );
}
