import { expect, test } from "vitest";
import { saveMerged, serialViewWriter } from "./board-view";
import { boardViewValues, type BoardView } from "../shared/settings";

/** A settings document whose revision another writer can bump. */
function store(initial: Partial<BoardView>) {
  let doc = boardViewValues(initial);
  let revision = 1;
  let shown = { values: doc, revision: String(revision) };
  const api = {
    get state() {
      return {
        status: "ready",
        values: shown.values,
        revision: shown.revision,
        save: async (values: BoardView, rev: string) => {
          if (rev !== String(revision)) return false;
          doc = values;
          revision++;
          shown = { values: doc, revision: String(revision) };
          return true;
        },
        reload: async () => {
          shown = { values: doc, revision: String(revision) };
        },
      };
    },
    /** Another part of the plugin saves without this reader noticing. */
    external(patch: Partial<BoardView>) {
      doc = { ...doc, ...patch };
      revision++;
    },
    get doc() {
      return doc;
    },
    fresh: async () => ({ status: "ready", values: doc, revision: String(revision) }),
  };
  return api;
}

test("a stale save is merged into the latest values instead of being lost", async () => {
  const s = store({ boardSort: "manual" });
  s.external({ sendBehavior: "queue" }); // our view is now one revision behind
  expect(await saveMerged(() => s.state, { boardSort: "priority" }, async () => undefined)).toBe(true);
  expect(s.doc).toMatchObject({ boardSort: "priority", sendBehavior: "queue" });
});

test("an unchanged value does not write", async () => {
  const s = store({ boardSort: "title" });
  const before = s.state.revision;
  expect(await saveMerged(() => s.state, { boardSort: "title" }, async () => undefined)).toBe(true);
  expect(s.state.revision).toBe(before);
});

test("rapid collapse then expand persists the last intent even while the first save is pending", async () => {
  const s = store({ collapsedColumns: ["design"] });
  let finish!: () => void;
  const blocked = new Promise<void>(resolve => { finish = resolve; });
  let saving!: () => void;
  const started = new Promise<void>(resolve => { saving = resolve; });
  let first = true;
  const writer = serialViewWriter(patch => saveMerged(() => {
    const snapshot = s.state;
    return { ...snapshot, save: async (values, revision) => {
      if (first) { first = false; saving(); await blocked; }
      return snapshot.save(values, revision);
    } };
  }, patch, async () => undefined, s.fresh));
  const collapse = writer({ runtimeCollapsed: ["idle"] });
  await started;
  const expand = writer({ runtimeCollapsed: [] });
  // Another window changes an unrelated field before the delayed write.
  s.external({ sendBehavior: "queue" });
  finish();
  expect(await collapse).toBe(true);
  expect(await expand).toBe(true);
  expect(s.doc).toMatchObject({ runtimeCollapsed: [], collapsedColumns: ["design"], sendBehavior: "queue" });
});

test("unchanged detection uses fresh stored data rather than a stale render", async () => {
  const s = store({ runtimeCollapsed: [] });
  s.external({ runtimeCollapsed: ["idle"], runtimeRange: "all" });
  expect(await saveMerged(() => s.state, { runtimeCollapsed: [] }, async () => undefined, s.fresh)).toBe(true);
  expect(s.doc).toMatchObject({ runtimeCollapsed: [], runtimeRange: "all" });
});

test("a failed write does not poison the serialized writer", async () => {
  const s = store({}); let first = true;
  const writer = serialViewWriter(patch => saveMerged(() => {
    if (first) { first = false; throw Error("offline"); }
    return s.state;
  }, patch, async () => undefined, s.fresh));
  expect(await writer({ runtimeRange: "24h" })).toBe(false);
  expect(await writer({ runtimeRange: "all" })).toBe(true);
  expect(s.doc.runtimeRange).toBe("all");
});

test("a delayed read from a previous host cannot write into a new host", async () => {
  const s = store({}); let sameHost = true;
  const revision = s.state.revision;
  expect(await saveMerged(() => s.state, { runtimeRange: "all" }, async () => undefined,
    async () => { sameHost = false; return s.fresh(); }, () => sameHost)).toBe(false);
  expect(s.state.revision).toBe(revision);
});

test("loading or invalid settings are never reset by a preference write", async () => {
  const s = store({}); const revision = s.state.revision;
  expect(await saveMerged(() => ({ ...s.state, status: "loading" }), { runtimeRange: "all" }, async () => undefined, s.fresh)).toBe(false);
  expect(await saveMerged(() => s.state, { runtimeRange: "all" }, async () => undefined, async () => ({ status: "invalid" }))).toBe(false);
  expect(s.state.revision).toBe(revision);
});
