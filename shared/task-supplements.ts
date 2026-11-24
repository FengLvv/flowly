import { z } from "zod";
import { descriptionImageSchema, descriptionImageInputsSchema, newDescriptionImageSchema } from "./description-images";

export const taskSupplementLimits = { perTask: 50, text: 2000 } as const;

export const taskSupplementIdSchema = z.string().min(1).max(200);
const fields = {
  id: taskSupplementIdSchema,
  text: z.string().trim().max(taskSupplementLimits.text),
};
function hasContent(entry: { text: string; images?: readonly unknown[] }) {
  return !!entry.text || !!entry.images?.length;
}
const blank = "A supplemental note needs text or an image.";
const taskSupplementSchema = z.strictObject({ ...fields, images: z.array(descriptionImageSchema).optional() }).refine(hasContent, blank);
const taskSupplementInputSchema = z.strictObject({ ...fields, images: descriptionImageInputsSchema.optional() }).refine(hasContent, blank);
const newTaskSupplementSchema = z.strictObject({ ...fields, images: z.array(newDescriptionImageSchema).optional() }).refine(hasContent, blank);
export type TaskSupplement = z.infer<typeof taskSupplementSchema>;
export type TaskSupplementInput = z.infer<typeof taskSupplementInputSchema>;

function distinctIds(entries: readonly { id: string }[]) {
  return new Set(entries.map(({ id }) => id)).size === entries.length;
}
const duplicate = "Duplicate supplemental note ID.";
export const taskSupplementsSchema = z.array(taskSupplementSchema).max(taskSupplementLimits.perTask).refine(distinctIds, duplicate);
export const taskSupplementInputsSchema = z.array(taskSupplementInputSchema).max(taskSupplementLimits.perTask).refine(distinctIds, duplicate);
export const newTaskSupplementsSchema = z.array(newTaskSupplementSchema).max(taskSupplementLimits.perTask).refine(distinctIds, duplicate);

export const appendTaskSupplementInput = z.strictObject({
  taskId: z.string().min(1),
  entry: newTaskSupplementSchema,
});
export type AppendTaskSupplementInput = z.infer<typeof appendTaskSupplementInput>;
