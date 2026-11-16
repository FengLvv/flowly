/** Tencent internal TAPD identities. Long IDs must never pass through Number. */
export type TapdKind = "story" | "bug" | "task";
export const tapdKinds: readonly TapdKind[] = ["story", "bug", "task"];
export const tapdId = (id: string) => /^(?:[1-9]\d{0,8}|[1-9]\d{18})$/.test(id);
export const tapdLongId = (id: string) => /^[1-9]\d{18}$/.test(id);
export const tapdKey = (project: string, kind: TapdKind, id: string) => `tapd:${project}:${kind}:${id}`;
export function splitTapdKey(key: string) {
  const m = /^tapd:([1-9]\d{0,9}):(story|bug|task):([1-9]\d*)$/.exec(key);
  return m && tapdId(m[3]!) ? { project: m[1]!, kind: m[2] as TapdKind, id: m[3]! } : null;
}
export const tapdItemType = (kind: TapdKind) => kind === "bug" ? "issue" as const : kind;

export function normalizeTapdBaseUrl(value: string): string | null {
  try {
    const u = new URL(value.trim());
    if (u.origin !== "https://tapd.woa.com" || u.username || u.password) return null;
    const m = /^\/(?:tapd_fe\/)?([1-9]\d{0,9})(?:\/|$)/.exec(u.pathname);
    return m ? `https://tapd.woa.com/tapd_fe/${m[1]}` : null;
  } catch { return null; }
}
export const tapdProject = (base: string) => /^https:\/\/tapd\.woa\.com\/tapd_fe\/([1-9]\d{0,9})$/.exec(base)?.[1] || null;

export function tapdFromUrl(value: string, baseUrl: string) {
  if (normalizeTapdBaseUrl(value) !== baseUrl) return null;
  const u = new URL(value.trim());
  const project = tapdProject(baseUrl);
  if (!project) return null;
  const modern = /^\/tapd_fe\/\d+\/(story|bug|task)\/detail\/([1-9]\d{18})\/?$/.exec(u.pathname);
  const legacy = /^\/\d+\/prong\/(stories|bugs|tasks)\/view\/([1-9]\d{18})\/?$/.exec(u.pathname);
  const dialog = /^(story|bug|task)_([1-9]\d{18})$/.exec(u.searchParams.get("dialog_preview_id") || "");
  const found = modern || legacy || dialog;
  if (!found) return null;
  const kind = ({ stories: "story", bugs: "bug", tasks: "task" }[found[1]!] || found[1]) as TapdKind;
  return { itemType: tapdItemType(kind), key: tapdKey(project, kind, found[2]!) };
}
export function tapdItemUrl(base: string, key: string) {
  const ref = splitTapdKey(key);
  return ref && ref.project === tapdProject(base) && tapdLongId(ref.id) ? `${base}/${ref.kind}/detail/${ref.id}` : "";
}
