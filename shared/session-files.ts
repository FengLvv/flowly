import { z } from "zod";

/** Original bytes only. A client may never nominate a daemon disk path. */
export const outgoingFileSchema = z.strictObject({
  name: z.string().min(1).max(1024).regex(/^[^\\/\0]+$/, "Give a file name, not a path.").refine(name => name !== "." && name !== "..", "Give a file name, not a path."),
  mimeType: z.string().min(1).max(256),
  // A repeated four-character group can exhaust V8's regex stack on large attachments.
  data: z.string().refine(data => data.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(data), "File data must be base64."),
});
export type OutgoingFile = z.infer<typeof outgoingFileSchema>;
export const uploadedFileSchema = z.strictObject({
  type: z.literal("uploaded_file"), id: z.string(), fileName: z.string(), mimeType: z.string(), size: z.number().nonnegative(), path: z.string(),
});
export type UploadedFile = z.infer<typeof uploadedFileSchema>;
const referenceFields = {
  forge: z.string(), number: z.number().int().positive(), title: z.string(),
  url: z.string().url().refine(value => /^https?:\/\//i.test(value), "Use an HTTP issue or pull request URL."),
  body: z.string().nullable().optional(),
};
export const forgeReferenceSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...referenceFields, type: z.literal("forge_issue"), mimeType: z.literal("application/paseo-forge-issue") }),
  z.strictObject({ ...referenceFields, type: z.literal("forge_change_request"), mimeType: z.literal("application/paseo-forge-change-request"), baseRefName: z.string().nullable().optional(), headRefName: z.string().nullable().optional() }),
]);
export type ForgeReference = z.infer<typeof forgeReferenceSchema>;
export const queuedFileSchema = z.object({
  file: z.string().regex(/^[a-f0-9-]+\.bin$/), name: outgoingFileSchema.shape.name, mimeType: outgoingFileSchema.shape.mimeType,
});
