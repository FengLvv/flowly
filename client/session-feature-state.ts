import type { PaseoAgent } from "@getpaseo/client";

export type SessionFeature = NonNullable<PaseoAgent["features"]>[number];

/** The display and the menu share the same effective choice, including older host snapshots. */
export function selectedFeatureOption(feature: Extract<SessionFeature, { type: "select" }>) {
  return feature.options.find(option => option.id === feature.value)
    ?? feature.options.find(option => option.isDefault);
}

// Paseo exposes feature values but its palette is private. Use its dark swatches
// and higher contrast shades of the same colors for Flowly's light surfaces.
const featureColors = {
  speed: { dark: "#fbbf24", light: "#a16207" },
  plan: { dark: "#60a5fa", light: "#2563eb" },
  autoAccept: { dark: "#4ade80", light: "#15803d" },
};

export function featureIconColor(feature: SessionFeature, dark: boolean): string | undefined {
  const selected = feature.type === "select" ? selectedFeatureOption(feature) : undefined;
  const active = feature.type === "toggle"
    ? feature.value
    : !!selected && !selected.isDefault;
  if (!active) return;

  const surface = dark ? "dark" : "light";
  switch (feature.id) {
    case "service_tier":
    case "fast_mode": return featureColors.speed[surface];
    case "plan_mode": return featureColors.plan[surface];
    case "auto_accept": return featureColors.autoAccept[surface];
  }
}
