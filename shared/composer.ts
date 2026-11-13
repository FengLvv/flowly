import { z } from "zod";

const id = z.string().min(1).max(200);

/** Original image attachments; Flowly imposes no count or size cap. */
export const imageMimeTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export const imageMimeSchema = z.enum(imageMimeTypes);
/** An image travelling with a message: base64 data (no data: prefix). */
export const outgoingImageSchema = z.strictObject({
  data: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9+/]+=*$/, "Image data must be base64."),
  mimeType: imageMimeSchema,
});
export type OutgoingImage = z.infer<typeof outgoingImageSchema>;
/** A queued message's image, stored as a daemon-side file until sent. */
export const queuedImageSchema = z.object({ file: z.string().regex(/^[A-Za-z0-9-]+\.(png|jpg|gif|webp)$/), mimeType: imageMimeSchema });

export const queuedMessageSchema = z
  .object({
    id: z.string(),
    text: z.string().max(20000),
    at: z.string(),
    images: z.array(queuedImageSchema).optional(),
  })
  .refine((m) => !!m.text.trim() || !!m.images?.length, "A queued message needs text or an image.");
export const composerEntrySchema = z.object({
  taskId: id,
  draft: z.string().max(20000),
  draftAt: z.string().nullable(),
  queue: z.array(queuedMessageSchema).max(50),
  /** Last failure sending a queued message; cleared on the next success. */
  lastError: z.string().max(2000).nullable(),
});
export const composerStateSchema = z.object({
  version: z.literal(1),
  sessions: z.record(z.string(), composerEntrySchema),
});
export type ComposerState = z.infer<typeof composerStateSchema>;
export type ComposerEntry = z.infer<typeof composerEntrySchema>;
export const composerTarget = z.strictObject({ taskId: id, agentId: id });
