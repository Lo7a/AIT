import { describe, expect, it } from "vitest";
import {
  readCatalogForm, CatalogInputError, validGapKeys, makeCatalogHandler,
} from "../src/server/api/admin-catalog-handler";
import type { SessionUser } from "../src/server/auth/session";
import { INDUSTRIES } from "../src/pipeline/industry";

// אופליין לגמרי: אין DB ואין רשת, כל התלויות מוזרקות - אותו דפוס כמו שאר ההאנדלרים

const ADMIN: SessionUser = { id: "u1", authId: "a1", email: "a@b.c", role: "admin" };
const OWNER: SessionUser = { id: "u2", authId: "a2", email: "o@b.c", role: "owner" };

const A_GAP = [...validGapKeys()][0];
// נלקח מהרשימה עצמה ולא נכתב ביד: כך שינוי בענפים לא שובר את הבדיקה בלי סיבה
const AN_INDUSTRY: string = INDUSTRIES[0];

function form(over: Record<string, string | string[]> = {}): FormData {
  const base: Record<string, string | string[]> = {
    name: "שירות בדיקה",
    problem: "הבעיה",
    solution: "הפתרון",
    serviceType: "ai",
    phase: "ai",
    complexity: "low",
    installTime: "יום",
    costRange: "1,000-2,000 שקל",
    savingRange: "שעתיים בשבוע",
    gapKeys: [A_GAP],
    ...over,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(base)) {
    if (v === "") continue;
    for (const one of Array.isArray(v) ? v : [v]) fd.append(k, one);
  }
  return fd;
}

describe("readCatalogForm", () => {
  it("קורא טופס תקין", () => {
    const out = readCatalogForm(form());
    expect(out.name).toBe("שירות בדיקה");
    expect(out.serviceType).toBe("ai");
    expect(out.gapKeys).toEqual([A_GAP]);
    // בלי סימון ענפי - null ולא מערך ריק. ההבחנה הזו היא ההבדל בין "לכל עסק"
    // לבין "לאף עסק" (ראו matching.ts)
    expect(out.industries).toBeNull();
  });

  it.each([
    ["name", "חסר שם"],
    ["problem", "חסר בעיה"],
    ["solution", "חסר פתרון"],
    ["installTime", "חסר זמן הטמעה"],
    ["costRange", "חסר מחיר"],
    ["savingRange", "חסר חיסכון"],
  ])("נופל כששדה חובה ריק: %s", (field) => {
    expect(() => readCatalogForm(form({ [field]: "" }))).toThrow(CatalogInputError);
  });

  it("דוחה סוג שירות שאינו ברשימה הסגורה", () => {
    expect(() => readCatalogForm(form({ serviceType: "משהו" }))).toThrow(/סוג שירות/);
  });

  it("דוחה שלב שאינו אחד מהארבעה", () => {
    expect(() => readCatalogForm(form({ phase: "someday" }))).toThrow(/שלב/);
  });

  it("דוחה מפתח פער שאינו חוק אמיתי ב-dimensions", () => {
    expect(() => readCatalogForm(form({ gapKeys: ["not_a_rule"] }))).toThrow(/מפתח פער/);
  });

  it("דורש לפחות פער אחד - אחרת השירות לא יותאם לאיש", () => {
    expect(() => readCatalogForm(form({ gapKeys: [] }))).toThrow(/פער אחד/);
  });

  it("פריט ענפי עם ענף תקין נקרא כרשימה", () => {
    const out = readCatalogForm(form({ industryScoped: "1", industries: [AN_INDUSTRY] }));
    expect(out.industries).toEqual([AN_INDUSTRY]);
  });

  it("סומן ענפי בלי לבחור ענף - נופל ולא נשמר כמערך ריק", () => {
    // מערך ריק היה נשמר כפריט שלא מתאים לאף ענף, כלומר פריט שנעלם בשקט
    expect(() => readCatalogForm(form({ industryScoped: "1", industries: [] }))).toThrow(/לא נבחר/);
  });

  it("דוחה ענף שאינו מוכר", () => {
    expect(() => readCatalogForm(form({ industryScoped: "1", industries: ["spaceship"] })))
      .toThrow(/ענף לא מוכר/);
  });
});

describe("makeCatalogHandler", () => {
  const deps = (user: SessionUser | null) => {
    const calls: string[] = [];
    return {
      calls,
      handler: makeCatalogHandler({
        getRealUser: async () => user,
        findByName: async () => null,
        create: async () => { calls.push("create"); return { id: "new-id" }; },
        update: async () => { calls.push("update"); },
        setArchived: async () => { calls.push("archive"); },
        addBenchmark: async () => { calls.push("benchmark"); },
        removeBenchmark: async () => { calls.push("benchmark_remove"); },
        emit: async () => { calls.push("emit"); },
      }),
    };
  };

  const post = (fd: FormData) => new Request("https://x/api/admin/catalog", { method: "POST", body: fd });

  it("אנונימי מקבל 401 ולא כותב כלום", async () => {
    const d = deps(null);
    expect((await d.handler(post(form()))).status).toBe(401);
    expect(d.calls).toEqual([]);
  });

  it("משתמש רגיל מקבל 404 ולא כותב כלום - קיום המסך לא נחשף", async () => {
    const d = deps(OWNER);
    expect((await d.handler(post(form()))).status).toBe(404);
    expect(d.calls).toEqual([]);
  });

  it("אדמין יוצר פריט חדש ונרשם ביומן", async () => {
    const d = deps(ADMIN);
    const res = await d.handler(post(form()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, id: "new-id" });
    expect(d.calls).toEqual(["create", "emit"]);
  });

  it("טופס פסול לא כותב כלום ומחזיר את הסיבה בעברית", async () => {
    const d = deps(ADMIN);
    const res = await d.handler(post(form({ name: "" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("שם");
    expect(d.calls).toEqual([]);
  });

  it("בנצ'מרק בלי מקור נדחה - מחיר בלי מקור לא נשמר", async () => {
    const d = deps(ADMIN);
    const fd = new FormData();
    fd.append("action", "benchmark_add");
    fd.append("id", "c1");
    fd.append("metric", "מדד");
    fd.append("range", "100-200");
    const res = await d.handler(post(fd));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("מקור");
    expect(d.calls).toEqual([]);
  });

  it("בנצ'מרק עם מקור נשמר", async () => {
    const d = deps(ADMIN);
    const fd = new FormData();
    fd.append("action", "benchmark_add");
    fd.append("id", "c1");
    fd.append("metric", "מדד");
    fd.append("range", "100-200");
    fd.append("source", "ספק כלשהו, אומת חי");
    const res = await d.handler(post(fd));
    expect(res.status).toBe(200);
    expect(d.calls).toEqual(["benchmark", "emit"]);
  });

  it("שם שכבר תפוס נדחה", async () => {
    const handler = makeCatalogHandler({
      getRealUser: async () => ADMIN,
      findByName: async () => ({ id: "other" }),
      create: async () => ({ id: "x" }),
      update: async () => {},
      setArchived: async () => {},
      addBenchmark: async () => {},
      removeBenchmark: async () => {},
      emit: async () => {},
    });
    const res = await handler(post(form()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("כבר קיים");
  });
});
