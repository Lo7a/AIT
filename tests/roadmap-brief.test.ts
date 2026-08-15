import { describe, expect, it } from "vitest";
import { buildBrief, type BriefBusiness } from "../src/pipeline/roadmap/brief";
import { sendBrief, consoleBriefTransport, type BriefTransport } from "../src/server/run-brief";
import type { RoadmapItemView } from "../src/server/roadmap-repo";
import type { BusinessModel } from "../src/pipeline/model/business-model";
import { makeFakeDb } from "./fakes/fake-db";

// פיקסצ'ר בסגנון אופטיקה בק (המודל האמיתי אחרי ראיון - ראו התוכנית) - כל טקסט חופשי כאן נבחר
// בכוונה בלי ספרות, כדי שבדיקת "אפס ספרות מומצאות" תישאר משמעותית ולא תיפול על ספרה לגיטימית
// שהבעלים כתב (למשל "יש לנו 3 סניפים") - זה לא הגבול שהמבחן הזה בודק
const item: RoadmapItemView = {
  id: "it1", catalogId: "cat1", score: 78, confidence: "medium", phase: "automation",
  status: "proposed",
  name: "חיבור לידים ל-CRM והתראות",
  problem: "לידים חדשים לא נכנסים למקום מרוכז - חלק נופלים בלי מענה",
  solution: "חיבור טופס האתר וערוצי הפניה למערכת CRM אחת עם התראה מיידית לצוות",
  costRange: "300-1200 בחודש",
  savingRange: "3-6 שעות ניהול פניות בשבוע",
  complexity: "medium",
  installTime: "2-4 שבועות",
  reasoning: "בעל העסק סיפר: \"קשה לי לעקוב אחרי כל הפניות, חלק פשוט נופלות בין הכיסאות\".",
  benchmarks: [
    {
      id: "bm1", metric: "הקמת אינטגרציית CRM", range: "300-1200 לחודש",
      source: "achiya-automation.com", verifiedAt: new Date("2026-08-01T00:00:00Z"),
    },
  ],
};

const model: BusinessModel = {
  data: {
    profile: { name: "אופטיקה בק", domain: "optikabek.co.il" },
    channels: { google: true },
    lead_flow: { whoHandles: "המזכירה עונה בטלפון", responseTime: "בדרך כלל באותו יום" },
    scheduling: {},
    service: {},
    billing: {},
    retention: {},
    tools: { platform: "wix", detected: [], invoiceTool: "חשבונית ירוקה, ומעקב פניות באקסל" },
    pains: { fromInterview: "קשה לי לעקוב אחרי כל הפניות, חלק פשוט נופלות בין הכיסאות" },
    manual_tasks: {},
  },
  fieldSources: {},
  credits: {
    profile: 1, channels: 0.5, lead_flow: 1, scheduling: 0, service: 0, billing: 0,
    retention: 0, tools: 1, pains: 1, manual_tasks: 0,
  },
  completenessPct: 50,
};

const business: BriefBusiness = {
  name: "אופטיקה בק", city: "באר שבע", phone: "08-1234567", website: "https://optikabek.co.il",
};

describe("buildBrief - תבנית מלאה", () => {
  it("כל שישה הסעיפים קיימים בסדר הנכון (סעיף 8 באפיון)", () => {
    const brief = buildBrief(item, model, business);
    const idx = {
      business: brief.indexOf("עסק:"),
      problem: brief.indexOf("הבעיה:"),
      solution: brief.indexOf("הפתרון והיקפו:"),
      systems: brief.indexOf("מערכות קיימות:"),
      price: brief.indexOf("הערכת מחיר וזמן הטמעה:"),
      questions: brief.indexOf("שאלות פתוחות לאיש המקצוע:"),
    };
    for (const v of Object.values(idx)) expect(v).toBeGreaterThan(-1);
    expect(idx.business).toBeLessThan(idx.problem);
    expect(idx.problem).toBeLessThan(idx.solution);
    expect(idx.solution).toBeLessThan(idx.systems);
    expect(idx.systems).toBeLessThan(idx.price);
    expect(idx.price).toBeLessThan(idx.questions);
  });

  it("פרטי העסק, הבעיה+נימוק, הפתרון, מערכות, ומחיר/זמן מופיעים כלשונם", () => {
    const brief = buildBrief(item, model, business);
    expect(brief).toContain("אופטיקה בק");
    expect(brief).toContain("באר שבע");
    expect(brief).toContain("08-1234567");
    expect(brief).toContain("https://optikabek.co.il");
    expect(brief).toContain(item.problem);
    expect(brief).toContain(item.reasoning);
    expect(brief).toContain(item.solution);
    expect(brief).toContain("חשבונית ירוקה, ומעקב פניות באקסל");
    expect(brief).toContain("300-1200 בחודש");
    expect(brief).toContain("3-6 שעות ניהול פניות בשבוע");
    expect(brief).toContain("2-4 שבועות");
    expect(brief).toContain("achiya-automation.com");
  });

  it("אפס ספרות מחוץ לערכים המוזרקים מהקטלוג/בנצ'מרקים/פרטי הקשר של העסק", () => {
    const brief = buildBrief(item, model, business);
    const injectedValues = [
      item.name, item.problem, item.solution, item.costRange, item.savingRange, item.installTime,
      item.reasoning ?? "",
      ...item.benchmarks.map((b) => b.metric), ...item.benchmarks.map((b) => b.range), ...item.benchmarks.map((b) => b.source),
      business.name, business.city ?? "", business.phone ?? "", business.website ?? "",
    ];
    let stripped = brief;
    for (const value of injectedValues) {
      if (value) stripped = stripped.split(value).join("");
    }
    expect(stripped).not.toMatch(/\d/);
  });

  it("model=null - גרסה מינימלית וחיננית, בלי קריסה", () => {
    const brief = buildBrief(item, null, business);
    expect(brief).toContain("טרם בוצע ראיון עם בעל העסק");
    expect(brief).toContain("לא דווחו מערכות");
    expect(brief).toContain(item.problem);
    expect(brief).toContain(item.solution);
  });

  it("פריט ביטחון נמוך - הנימוק המעוגן-ציטוט מופיע כלשונו, בלי ניסוח 'חסר לך' מעל", () => {
    const lowConfidenceItem: RoadmapItemView = {
      ...item, confidence: "low",
      reasoning: "בעל העסק סיפר: \"הלקוחות מתלוננים שקשה לתאם תור\".",
    };
    const brief = buildBrief(lowConfidenceItem, null, business);
    expect(brief).toContain(lowConfidenceItem.reasoning as string);
    expect(brief).not.toContain("חסר לך");
    expect(brief).not.toContain("לעסק חסר");
  });

  it("שאלות פתוחות שונות לכל שלב (quick_wins/automation/ai/transformation)", () => {
    const phases: RoadmapItemView["phase"][] = ["quick_wins", "automation", "ai", "transformation"];
    const questionSections = phases.map((phase) => {
      const brief = buildBrief({ ...item, phase }, model, business);
      return brief.slice(brief.indexOf("שאלות פתוחות לאיש המקצוע:"));
    });
    const unique = new Set(questionSections);
    expect(unique.size).toBe(phases.length);
  });

  it("דטרמיניזם - שתי הרצות עם אותו קלט מפיקות מחרוזת זהה", () => {
    const a = buildBrief(item, model, business);
    const b = buildBrief(item, model, business);
    expect(a).toBe(b);
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seedFullChain(fake: any, opts: { itemStatus?: string } = {}) {
  const { businesses, diagnoses, catalogs, roadmaps, roadmapItems, models } = fake;
  businesses.push({
    id: "b1", name: "אופטיקה בק", placeId: "p1", websiteKey: null,
    website: "https://optikabek.co.il", phone: "08-1234567", address: null, city: "באר שבע",
  });
  diagnoses.push({ id: "d1", businessId: "b1", status: "roadmap_ready", createdAt: new Date() });
  catalogs.push({
    id: "cat1", name: item.name, problem: item.problem, solution: item.solution,
    costRange: item.costRange, savingRange: item.savingRange, complexity: item.complexity,
    installTime: item.installTime,
  });
  roadmaps.push({ id: "rm1", diagnosisId: "d1", createdAt: new Date(), updatedAt: new Date() });
  roadmapItems.push({
    id: "it1", roadmapId: "rm1", catalogId: "cat1", score: item.score, confidence: item.confidence,
    phase: item.phase, reasoning: item.reasoning, status: opts.itemStatus ?? "proposed", updatedAt: new Date(),
  });
  models.push({ where: { diagnosisId: "d1" }, payload: model });
}

describe("sendBrief - אינטגרציה על fake-db (run-brief.ts)", () => {
  it("הצלחה: יוצר Brief, מעביר סטטוס ל-requested, קורא לתובלה עם BRIEF_EMAIL, ומעדכן sentAt", async () => {
    const fake = makeFakeDb() as any;
    seedFullChain(fake);
    const sent: { to: string; subject: string; body: string }[] = [];
    const transport: BriefTransport = { async send(to, subject, body) { sent.push({ to, subject, body }); } };

    const result = await sendBrief(fake.db, transport, "it1");

    expect(result).toEqual({ ok: true, sent: true });
    expect(fake.briefs).toHaveLength(1);
    expect(fake.briefs[0].sentAt).not.toBeNull();
    expect(fake.briefs[0].content).toContain(item.problem);
    expect(fake.roadmapItems.find((it: any) => it.id === "it1").status).toBe("requested");
    expect(sent).toHaveLength(1);
    // בלי BRIEF_EMAIL ב-env (כברירת מחדל בסביבת הבדיקות) - נופל לברירת המחדל הקבועה בקוד
    expect(sent[0].to).toBe("lahavk@raion.co.il");
    expect(sent[0].subject).toContain("אופטיקה בק");
    expect(sent[0].subject).toContain(item.name);
  });

  it("כשל תובלה: Brief עדיין נשמר, sentAt נשאר null, {ok:true, sent:false}", async () => {
    const fake = makeFakeDb() as any;
    seedFullChain(fake);
    const transport: BriefTransport = { async send() { throw new Error("אין עדיין ספק מייל"); } };

    const result = await sendBrief(fake.db, transport, "it1");

    expect(result).toEqual({ ok: true, sent: false });
    expect(fake.briefs).toHaveLength(1);
    expect(fake.briefs[0].sentAt).toBeNull();
    // הבקשה עצמה עדיין נרשמה - הסטטוס עבר, רק השליחה בפועל נכשלה
    expect(fake.roadmapItems.find((it: any) => it.id === "it1").status).toBe("requested");
  });

  it("פריט לא נמצא - InterviewError not_found", async () => {
    const fake = makeFakeDb() as any;
    await expect(sendBrief(fake.db, consoleBriefTransport, "אין-כזה")).rejects.toMatchObject({ kind: "not_found" });
  });

  it("סטטוס כבר requested - עדיין מותר (הבעלים לחץ שוב), נוצר Brief נוסף", async () => {
    const fake = makeFakeDb() as any;
    seedFullChain(fake, { itemStatus: "requested" });

    const result = await sendBrief(fake.db, consoleBriefTransport, "it1");

    expect(result.ok).toBe(true);
    expect(fake.briefs).toHaveLength(1);
    expect(fake.roadmapItems.find((it: any) => it.id === "it1").status).toBe("requested");
  });

  it("אטומיות: כשל ביצירת Brief משאיר את הפריט proposed - עדכון הסטטוס מתגלגל אחורה", async () => {
    const fake = makeFakeDb({ failBriefCreate: true }) as any;
    seedFullChain(fake);

    await expect(sendBrief(fake.db, consoleBriefTransport, "it1")).rejects.toThrow();

    expect(fake.briefs).toHaveLength(0);
    expect(fake.roadmapItems.find((it: any) => it.id === "it1").status).toBe("proposed");
  });
});
