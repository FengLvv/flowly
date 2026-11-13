import { expect, test } from "vitest";
import { descriptionImageInputsSchema, descriptionKey, hasInstruction, instructionText } from "./description-images";

test("image-only instructions use the card title; custom text stays the user's text", () => {
  expect(hasInstruction("  ", [])).toBe(false);
  expect(hasInstruction("", [{}])).toBe(true);
  expect(instructionText("", "Card goal", [{}])).toBe("Card goal");
  expect(instructionText("  Plan only  ", "Card goal", [{}])).toBe("Plan only");
  expect(instructionText("", "Card goal", [])).toBe("");
});
test("a copied snapshot notices description or picture changes", () => {
  const copied = descriptionKey("Goal", [{ id: "a" }]);
  expect(descriptionKey("Goal", [{ id: "a" }])).toBe(copied);
  expect(descriptionKey("New goal", [{ id: "a" }])).not.toBe(copied);
  expect(descriptionKey("Goal", [{ id: "b" }])).not.toBe(copied);
  expect(descriptionImageInputsSchema.safeParse(Array(12).fill({ id: "00000000-0000-4000-8000-000000000000" })).success).toBe(true);
});
