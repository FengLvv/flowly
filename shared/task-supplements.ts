import { z } from "zod";

export const taskSupplementLimits = { perTask: 50, text: 2000 } as const;

export const taskSupplementSchema = z.strictObject({
  id: z.string().min(1).max(200),
  text: z.string().trim().min(1).max(taskSupplementLimits.text),
});
export type TaskSupplement = z.infer<typeof taskSupplementSchema>;

export const taskSupplementsSchema = z.array(taskSupplementSchema)
  .max(taskSupplementLimits.perTask)
  .refine((entries) => new Set(entries.map(({ id }) => id)).size === entries.length, "Duplicate supplemental note ID.");

export const appendTaskSupplementInput = z.strictObject({
  taskId: z.string().min(1),
  entry: taskSupplementSchema,
});
export type AppendTaskSupplementInput = z.infer<typeof appendTaskSupplementInput>;
