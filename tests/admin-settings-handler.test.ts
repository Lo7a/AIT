import { describe, expect, it } from "vitest";
import { EDITABLE_SETTINGS, makeSettingsHandler, type SettingsDeps } from "../src/server/api/admin-settings-handler";
import { GLOBAL_RULES, RATE_RULES } from "../src/server/rate-limit";
import type { SessionUser } from "../src/server/auth/session";
import type { UsageEventInput } from "../src/server/usage-events";

// עריכת מגבלות מהניהול: השער (אדמין אמיתי בלבד!), הוולידציה (הכול או כלום), רישום היומן,
// וריק=חזרה לברירת המחדל

const ADMIN: SessionUser = { id: "u-admin", authId: "a1", email: "a@x.com", role: "admin" };
const OWNER: SessionUser = { id: "u-owner", authId: "a2", email: "b@x.com", role: "owner" };

function makeDeps(real: SessionUser | null, stored: Record<string, string> = {}) {
  const settings = new Map(Object.entries(stored));
  const events: UsageEventInput[] = [];
  const deps: SettingsDeps = {
    getRealUser: async () => real,
    readSetting: async (key) => settings.get(key) ?? null,
    writeSetting: async (key, value) => { settings.set(key, value); },
    clearSetting: async (key) => { settings.delete(key); },
    emit: async (input) => { events.push(input); },
  };
  return { deps, settings, events };
}

function formRequest(fields: Record<string, string>): Request {
  const form = new URLSearchParams(fields);
  return new Request("https://ait.example/api/admin/settings", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

describe("makeSettingsHandler", () => {
  it("EDITABLE_SETTINGS נגזר מהחוקים - כל מגבלה קיימת מיוצגת פעם אחת", () => {
    const keys = EDITABLE_SETTINGS.map((s) => s.settingKey);
    const expected = [
      ...Object.values(RATE_RULES).map((r) => r.settingKey),
      ...Object.values(GLOBAL_RULES).map((r) => r.settingKey),
    ];
    expect(keys).toEqual(expected);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("שער: אנונימי 401, לא-אדמין 404 (בלי להסגיר שהמסלול קיים) - ושום כתיבה", async () => {
    const anon = makeDeps(null);
    expect((await makeSettingsHandler(anon.deps)(formRequest({ "rate.scan": "5" }))).status).toBe(401);
    const owner = makeDeps(OWNER);
    expect((await makeSettingsHandler(owner.deps)(formRequest({ "rate.scan": "5" }))).status).toBe(404);
    expect(owner.settings.size).toBe(0);
    expect(owner.events).toHaveLength(0);
  });

  it("אדמין שומר ערך: נכתב, נרשם ביומן עם הישן והחדש, וחוזרים לעמוד הניהול", async () => {
    const { deps, settings, events } = makeDeps(ADMIN);
    const res = await makeSettingsHandler(deps)(formRequest({ "rate.scan": "25" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/admin");
    expect(settings.get("rate.scan")).toBe("25");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "settings_changed", userId: ADMIN.id,
      metadata: { key: "rate.scan", from: null, to: "25" },
    });
  });

  it("ערך פסול - 400 ושום שינוי לא נכתב (הכול או כלום)", async () => {
    const { deps, settings, events } = makeDeps(ADMIN);
    const res = await makeSettingsHandler(deps)(formRequest({ "rate.scan": "20", "rate.search": "-3" }));
    expect(res.status).toBe(400);
    expect(settings.size).toBe(0);
    expect(events).toHaveLength(0);
  });

  it("שדה ריק מוחק דריסה קיימת (חזרה לברירת המחדל) ונרשם; ערך זהה לא מייצר אירוע", async () => {
    const { deps, settings, events } = makeDeps(ADMIN, { "rate.scan": "25", "rate.search": "70" });
    await makeSettingsHandler(deps)(formRequest({ "rate.scan": "", "rate.search": "70" }));
    expect(settings.has("rate.scan")).toBe(false);
    expect(settings.get("rate.search")).toBe("70");
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toMatchObject({ key: "rate.scan", from: "25", to: null });
  });

  it("מפתח שאינו ברשימה הסגורה לא נכתב לעולם", async () => {
    const { deps, settings } = makeDeps(ADMIN);
    await makeSettingsHandler(deps)(formRequest({ "rate.scan": "12", hacked: "1", "rate.notreal": "9" }));
    expect(settings.get("rate.scan")).toBe("12");
    expect(settings.size).toBe(1);
  });
});
