import { describe, expect, it } from "vitest";
import { featureIconColor, selectedFeatureOption, type SessionFeature } from "./session-feature-state";

const normal = { id: "normal-tier", label: "Normal", isDefault: true };
const faster = { id: "another-tier", label: "Faster" };
const speed = (value: string | null): Extract<SessionFeature, { type: "select" }> => ({
  id: "service_tier", type: "select", label: "Speed", options: [faster, normal], value,
});

describe("composer feature indicators", () => {
  it("highlights Speed from the selected option, independent of its ID, label or order", () => {
    expect(selectedFeatureOption(speed(faster.id))).toBe(faster);
    expect(featureIconColor(speed(faster.id), true)).toBe("#fbbf24");
    expect(featureIconColor(speed(faster.id), false)).toBe("#a16207");
    expect(featureIconColor(speed(normal.id), true)).toBeUndefined();
  });

  it.each([null, "obsolete-tier"])("resolves %s to the advertised default without a highlight", value => {
    expect(selectedFeatureOption(speed(value))).toBe(normal);
    expect(featureIconColor(speed(value), true)).toBeUndefined();
    const withoutDefault = { ...speed(value), options: [faster] };
    expect(selectedFeatureOption(withoutDefault)).toBeUndefined();
    expect(featureIconColor(withoutDefault, true)).toBeUndefined();
  });

  it.each([
    ["fast_mode", "#fbbf24"],
    ["plan_mode", "#60a5fa"],
    ["auto_accept", "#4ade80"],
    ["unrecognized", undefined],
  ])("uses the native highlight family for %s only when enabled", (id, color) => {
    const toggle: SessionFeature = { id, label: id, type: "toggle", value: true };
    expect(featureIconColor(toggle, true)).toBe(color);
    expect(featureIconColor({ ...toggle, value: false }, true)).toBeUndefined();
  });
});
