import { memo } from "react";
import { Image, View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { readDescriptionImages, readSupplementImage } from "../shared/rpc";
import type { Task } from "../shared/model";
import type { DescriptionImage } from "../shared/description-images";
import { Button, Label, message, radius, space, useTheme } from "./ui";
import { ImagePreviewTrigger } from "./image-viewer";
import { t } from "../shared/i18n";

export const ImagePreview = memo(function ImagePreview({ uri, name, small = false }: { uri: string; name: string; small?: boolean }) {
  const theme = useTheme();
  return (
    <ImagePreviewTrigger uri={uri} name={name}>
      <Image source={{ uri }} accessibilityLabel={name} resizeMode="contain" style={{ width: small ? 52 : 160, height: small ? 52 : 112, borderRadius: radius.md, backgroundColor: theme.colors.surface2 }} />
    </ImagePreviewTrigger>
  );
});

const SavedImage = memo(function SavedImage({ taskId, revision, image, supplementId, onRemove }: {
  taskId: string; revision: number; image: DescriptionImage; supplementId?: string; onRemove?: (id: string) => void;
}) {
  const read = useRpc(readDescriptionImages);
  const readNote = useRpc(readSupplementImage);
  const query = useQuery({
    queryKey: ["flowly", "card-image", taskId, revision, image.id, supplementId],
    queryFn: async () => supplementId
      ? readNote({ taskId, revision, imageId: image.id, supplementId })
      : (await read({ taskId, revision, imageId: image.id })).images[0],
    staleTime: Infinity, gcTime: 5 * 60_000, retry: false,
  });
  const data = query.data;
  return <View style={{ gap: space[1], maxWidth: 180 }}>
    {data ? <ImagePreview uri={`data:${data.mimeType};base64,${data.data}`} name={image.name} small={!!supplementId} />
      : <Label muted>{query.error ? message(query.error) : t("Loading…")}</Label>}
    {onRemove && <Button quiet small onPress={() => onRemove(image.id)}>{t("Remove")}</Button>}
  </View>;
});

export const DescriptionImages = memo(function DescriptionImages({ task, images = task.descriptionImages || [], supplementId, onRemove }: {
  task: Task; images?: readonly DescriptionImage[]; supplementId?: string; onRemove?: (id: string) => void;
}) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
    {images.map((image) => <SavedImage key={image.id} taskId={task.id} revision={task.revision} image={image} supplementId={supplementId} onRemove={onRemove} />)}
  </View>;
});
