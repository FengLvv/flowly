import { z } from "zod";
import { imageMimeSchema, outgoingImageSchema } from "./composer";

export const descriptionImageSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  mimeType: imageMimeSchema,
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const newDescriptionImageSchema = outgoingImageSchema.extend({ name: z.string().min(1).max(200) });
export const descriptionImageInputSchema = z.union([z.strictObject({ id: z.string().uuid() }), newDescriptionImageSchema]);
export const descriptionImageInputsSchema = z.array(descriptionImageInputSchema);
export type DescriptionImage = z.infer<typeof descriptionImageSchema>;
export type DescriptionImageInput = z.infer<typeof descriptionImageInputSchema>;

/** Compare only at explicit copy/submit, never on each keystroke. */
export const descriptionKey = (text: string, images: readonly unknown[]) => JSON.stringify([text, images]);
export const hasInstruction = (text: string, images: readonly unknown[]) => !!text.trim() || images.length > 0;
export const instructionText = (text: string, title: string, images: readonly unknown[]) => text.trim() || (images.length ? title : "");
