import { describe, expect, test } from "vitest";
import { classifyQuery, externalTarget, faceKey, itemUrl, parseKey } from "./connectors";
import { normalizeTapdBaseUrl, splitTapdKey, tapdFromUrl, tapdKey } from "./tapd";

const baseUrl = "https://tapd.woa.com/tapd_fe/42";
const connection = { id: "c", provider: "tapd-internal" as const, baseUrl };
const id = "1000000042000000123";
describe("TAPD identities and project boundaries", () => {
  test.each([`${baseUrl}/`, `${baseUrl}/story/detail/${id}?x=1`, "https://tapd.woa.com/42/prong/stories/view/" + id])("normalizes a project or detail URL: %s", (url) => expect(normalizeTapdBaseUrl(url)).toBe(baseUrl));
  test.each(["https://tapd.cn/tapd_fe/42", "https://tapd.woa.com.evil.test/tapd_fe/42", "http://tapd.woa.com/tapd_fe/42", "https://a:b@tapd.woa.com/tapd_fe/42", "https://tapd.woa.com:9443/tapd_fe/42", "https://tapd.woa.com", "https://tapd.woa.com/tapd_fe/0", "https://tapd.woa.com/tapd_fe/42a"])('rejects unsafe or missing project: %s', (url) => expect(normalizeTapdBaseUrl(url)).toBeNull());
  test.each(["story", "bug", "task"] as const)("recognizes %s details and preserves all 19 digits", (kind) => {
    const ref = tapdFromUrl(`${baseUrl}/${kind}/detail/${id}`, baseUrl)!;
    expect(ref.key).toBe(tapdKey("42", kind, id));
    expect(itemUrl(connection, ref.itemType, ref.key)).toBe(`${baseUrl}/${kind}/detail/${id}`);
    expect(externalTarget(`${baseUrl}/${kind}/detail/${id}`, [connection])).toMatchObject({ connectionId: "c", ...ref });
    expect(faceKey(ref)).toBe(`${kind}-123`);
  });
  test("dialog ID wins over the iteration ID; links cannot cross projects", () => {
    expect(tapdFromUrl(`${baseUrl}/iteration/card/1000000042000000999?dialog_preview_id=bug_${id}`, baseUrl)?.key).toBe(tapdKey("42", "bug", id));
    expect(tapdFromUrl(`${baseUrl.replace('/42','/43')}/story/detail/${id}`, baseUrl)).toBeNull();
    expect(tapdFromUrl(`${baseUrl}/story/detail/123`, baseUrl)).toBeNull();
    expect(tapdFromUrl(`${baseUrl}/story/list?queryToken=abc`, baseUrl)).toBeNull();
  });
  test("keys distinguish projects and types, typed short IDs require a selected connection", () => {
    expect(parseKey(tapdKey("42", "bug", id), connection.provider)).toEqual({ itemType: "issue", key: tapdKey("42", "bug", id) });
    expect(splitTapdKey(`tapd:42:story:9007199254740993`)).toBeNull();
    expect(classifyQuery("bug-123", connection)).toEqual({ kind: "key", itemType: "issue", key: "tapd:42:bug:123" });
    expect(classifyQuery(id, connection)).toEqual({ kind: "number", number: id });
    expect(externalTarget("bug-123", [connection])).toBeNull();
    expect(externalTarget(tapdKey("42", "story", id), [connection, { ...connection, id: "other", baseUrl: baseUrl.replace('/42','/43') }])).toMatchObject({ connectionId: "c" });
  });
});
