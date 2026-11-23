export type ComposerCommand = { name: string; description: string; argumentHint: string; kind?: "command" | "skill"; hostOnly?: boolean; aliases?: readonly string[] };
/** A leading slash token, while the cursor is still inside that token. */
export function commandQuery(text: string, cursor: number) {
  if (!text.startsWith("/") || /\s/.test(text.slice(1, cursor)) || cursor < 1) return null;
  return text.slice(1, cursor).toLowerCase();
}
export function commandMatches(commands: readonly ComposerCommand[], query: string) {
  return commands.filter(command => [command.name, ...(command.aliases || [])].some(name => name.toLowerCase().replace(/^\//, "").includes(query)));
}
export function insertCommand(text: string, command: ComposerCommand) {
  const suffix = text.replace(/^\/[^\s]*/, "");
  return `/${command.name.replace(/^\//, "")}${suffix || " "}`;
}

export function isHostCommand(text: string) { return /^\/(exit|quit|q|clear|new)\s*$/i.test(text.trim()); }
