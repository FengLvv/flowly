import { memo, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { readDescriptionImages } from "../shared/rpc";
import type { Task } from "../shared/model";
import type { DescriptionImage } from "../shared/description-images";
import { Button, Label, Theme, message, noFocusRing, radius, space, useTheme } from "./ui";
import { Modal } from "./modal";
import { t } from "../shared/i18n";

export const ImagePreview = memo(function ImagePreview({ uri, name, small = false }: { uri: string; name: string; small?: boolean }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return <>
    <Pressable style={noFocusRing} accessibilityRole="imagebutton" accessibilityLabel={t("{alt}. Open larger", { alt: name })} onPress={() => setOpen(true)}>
      <Image source={{ uri }} accessibilityLabel={name} resizeMode="contain" style={{ width: small ? 52 : 160, height: small ? 52 : 112, borderRadius: radius.md, backgroundColor: theme.colors.surface2 }} />
    </Pressable>
    <Modal open={open} title={name} onOpenChange={setOpen}>
      <Modal.Content><Theme.Provider value={theme}>
        <Image source={{ uri }} accessibilityLabel={name} resizeMode="contain" style={{ width: "100%", height: 420, maxHeight: 640 }} />
      </Theme.Provider></Modal.Content>
    </Modal>
  </>;
});

const SavedImage = memo(function SavedImage({ taskId, revision, image, onRemove }: { taskId: string; revision: number; image: DescriptionImage; onRemove?: (id: string) => void }) {
  const read = useRpc(readDescriptionImages);
  const query = useQuery({
    queryKey: ["flowly", "description-image", taskId, revision, image.id],
    queryFn: () => read({ taskId, revision, imageId: image.id }),
    staleTime: Infinity, gcTime: 5 * 60_000, retry: false,
  });
  const data = query.data?.images[0];
  return <View style={{ gap: space[1], maxWidth: 180 }}>
    {data ? <ImagePreview uri={`data:${data.mimeType};base64,${data.data}`} name={image.name} />
      : <Label muted>{query.error ? message(query.error) : t("Loading…")}</Label>}
    {onRemove && <Button quiet small onPress={() => onRemove(image.id)}>{t("Remove")}</Button>}
  </View>;
});

export const DescriptionImages = memo(function DescriptionImages({ task, images = task.descriptionImages || [], onRemove }: { task: Task; images?: readonly DescriptionImage[]; onRemove?: (id: string) => void }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
    {images.map((image) => <SavedImage key={image.id} taskId={task.id} revision={task.revision} image={image} onRemove={onRemove} />)}
  </View>;
});
