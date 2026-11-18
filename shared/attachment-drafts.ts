import { z } from "zod";
import { outgoingFileSchema, forgeReferenceSchema } from "./session-files";

const id = z.string().min(1).max(200);
const common = { id, name: outgoingFileSchema.shape.name, mimeType: outgoingFileSchema.shape.mimeType };
const reference = z.strictObject({ id, kind: z.literal("reference"), reference: forgeReferenceSchema });
export const draftAttachmentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...common, kind: z.literal("image"), mimeType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]), data: outgoingFileSchema.shape.data }),
  z.strictObject({ ...common, kind: z.literal("file"), data: outgoingFileSchema.shape.data }), reference,
]);
export type DraftAttachment = z.infer<typeof draftAttachmentSchema>;
export const hydratedAttachmentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...common, kind: z.literal("image"), data: z.string().nullable() }),
  z.strictObject({ ...common, kind: z.literal("file"), data: z.string().nullable() }), reference,
]);
export type HydratedAttachment = z.infer<typeof hydratedAttachmentSchema>;
export const storedDraftAttachmentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...common, kind: z.literal("image"), file: z.string().regex(/^[a-f0-9-]+\.bin$/) }),
  z.strictObject({ ...common, kind: z.literal("file"), file: z.string().regex(/^[a-f0-9-]+\.bin$/) }), reference,
]);
export type StoredDraftAttachment = z.infer<typeof storedDraftAttachmentSchema>;
