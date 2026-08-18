import { describe, expect, it } from "vitest";
import { QUESTION_BANK, staticUpdateFor } from "../src/pipeline/interview/questions";
import { LEAD_DROP_RE } from "../src/pipeline/score/dimensions";
import { runInterviewTurn } from "../src/server/run-interview";
import { makeFakeDb } from "./fakes/fake-db";
import type { ScanFindings } from "../src/pipeline/types";

// הנתיב הסטטי (הכרעת מייסד 17.8): תשובת צ'יפים ממופה דטרמיניסטית למודל בלי LLM.
// הבדיקות כאן נועלות את שלושת החוזים: (1) כל שאלה עם options חייבת field, (2) ההתאמה
// מקבלת אך ורק תוויות מדויקות מהתפריט ונופלת ל-LLM על כל דבר אחר, (3) תור צ'יפים שלם
// רץ בלי לגעת ב-LLM בכלל.

const findings: ScanFindings = {
  business: { placeId: "p1", name: "עסק" },
  websiteSignals: {
    pagesCrawled: 3, crawledUrls: [], hasContactForm: true, hasWhatsappLink: false,
    hasPhoneLink: true, hasEmailLink: false, hasOnlineBooking: false, hasChatWidget: false,
    hasFacebookPixel: false, hasGoogleAnalytics: false,
  },
  partial: [],
  meta: { startedAt: "t", durationMs: 1, placesCalls: 1, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 },
};

function seed(diagnoses: any[], scans: any[]) {
  diagnoses.push({ id: "d1", businessId: "b1", status: "interviewing" });
  scans.push({ id: "s1", diagnosisId: "d1", findings, createdAt: new Date() });
}

// complete שנתיב סטטי אסור לו להגיע אליו - זריקה מוכיחה אפס LLM
const forbiddenComplete = async (): Promise<never> => {
  throw new Error("קריאת LLM בנתיב סטטי - אסור");
};

const byKey = (key: string) => {
  const q = QUESTION_BANK.find((x) => x.key === key);
  if (!q) throw new Error(`שאלה ${key} לא בבנק`);
  return q;
};

describe("בנק השאלות - חוזה הנתיב הסטטי", () => {
  it("לכל שאלה עם options יש field בשם camelCase תקין", () => {
    for (const q of QUESTION_BANK) {
      if (q.options == null) continue;
      expect(q.field, `לשאלה ${q.key} חסר field`).toBeTruthy();
      expect(q.field).toMatch(/^[a-z][a-zA-Z0-9]{1,39}$/);
    }
  });

  it("אין שתי שאלות באותה סקציה שחולקות field (דריסה הדדית במודל)", () => {
    const seen = new Set<string>();
    for (const q of QUESTION_BANK) {
      if (q.field == null) continue;
      const pair = `${q.section}:${q.field}`;
      expect(seen.has(pair), `field כפול ${pair}`).toBe(false);
      seen.add(pair);
    }
  });
});

describe("staticUpdateFor", () => {
  it("תווית בודדת מדויקת - עדכון לסקציה ולשדה של השאלה", () => {
    const u = staticUpdateFor(byKey("lead_flow_response_time"), "תוך דקות");
    expect(u).toEqual({ section: "lead_flow", fields: { responseTime: "תוך דקות" } });
  });

  // שאלת שווי הלקוח היא צ'יפים ככל השאר - אסור שתעלה שקל אחד של LLM. התוויות מכילות פסיקי
  // אלפים ("1,000-5,000 שקל"), ולכן חשוב במיוחד שההתאמה תהיה על התווית השלמה ולא split על פסיק
  it("שווי לקוח: תווית עם פסיק אלפים - התאמה מלאה verbatim לשדה avgDealValue", () => {
    const q = byKey("lead_flow_deal_value");
    expect(staticUpdateFor(q, "1,000-5,000 שקל")).toEqual({
      section: "lead_flow", fields: { avgDealValue: "1,000-5,000 שקל" },
    });
    for (const o of q.options!) {
      expect(staticUpdateFor(q, o.label)?.fields.avgDealValue, o.label).toBe(o.label);
    }
  });

  it("שווי לקוח: סכום שהבעלים כתב בעצמו ולא מהתפריט - null (נופל ל-LLM, בלי לנחש טווח)", () => {
    expect(staticUpdateFor(byKey("lead_flow_deal_value"), "בערך 2,500")).toBeNull();
    expect(staticUpdateFor(byKey("lead_flow_deal_value"), "עד 300 שקל, מעל 5,000 שקל")).toBeNull();
  });

  it("תווית עם פסיק בתוכה (בחירה בודדת) - התאמה מלאה, לא נשברת על הפסיק", () => {
    const u = staticUpdateFor(byKey("lead_flow_lost"), "כן, קורה שפנייה מתפספסת");
    expect(u?.fields.leadDrop).toBe("כן, קורה שפנייה מתפספסת");
    // הצלבה מול הרג'קס של מנוע הציונים: הערך הסטטי מדליק את אותו פער בדיוק כמו חילוץ LLM
    expect(LEAD_DROP_RE.test(String(u?.fields.leadDrop))).toBe(true);
  });

  it("בחירה מרובה: שרשור תוויות כפי שה-UI שולח, גם בסדר הפוך", () => {
    const q = byKey("lead_flow_intake");
    expect(staticUpdateFor(q, "בעיקר טלפון, וואטסאפ")?.fields.intakeChannels).toBe("בעיקר טלפון, וואטסאפ");
    expect(staticUpdateFor(q, "וואטסאפ, בעיקר טלפון")?.fields.intakeChannels).toBe("וואטסאפ, בעיקר טלפון");
  });

  it("טקסט חופשי או ניסוח שאינו מהתפריט - null (נופל ל-LLM)", () => {
    expect(staticUpdateFor(byKey("lead_flow_intake"), "אצלנו הכל דרך המזכירה")).toBeNull();
    expect(staticUpdateFor(byKey("lead_flow_intake"), "וואטסאפ, וגם קצת טלפון")).toBeNull();
    expect(staticUpdateFor(byKey("lead_flow_intake"), "")).toBeNull();
  });

  it("שרשור תוויות על שאלת בחירה בודדת - null (ה-UI לא שולח כזה)", () => {
    expect(staticUpdateFor(byKey("lead_flow_response_time"), "תוך דקות, באותו יום")).toBeNull();
  });

  it("שאלה בלי options (שאלת הסיכום) - תמיד null", () => {
    expect(staticUpdateFor(byKey("closing_pains"), "הטלפונים לא מפסיקים")).toBeNull();
  });
});

describe("runInterviewTurn - הנתיב הסטטי", () => {
  it("תשובת צ'יפים: אפס קריאות LLM, קרדיט מלא, שאלה הבאה מסקציה אחרת", async () => {
    const { db, diagnoses, scans, messages, models } = makeFakeDb() as any;
    seed(diagnoses, scans);
    const r = await runInterviewTurn(db, "d1",
      { content: "בעיקר טלפון, וואטסאפ", questionKey: "lead_flow_intake", isFreeText: false },
      { complete: forbiddenComplete });
    expect(r.usedFallback).toBe(false);
    expect(r.reply.length).toBeGreaterThan(0);
    // חוזה no-echo: האישור לא מצטט את התשובה
    expect(r.reply).not.toContain("טלפון");
    expect(r.credits.lead_flow).toBe(1);
    expect(r.nextQuestion?.key).toBe("service_repeat");
    expect(messages).toHaveLength(2);
    expect(models).toHaveLength(1);
    // צורת רישום ה-upsert ב-fake-db: create/update מוחזקים כפי שנשלחו ל-prisma
    expect(models[0].create.data.lead_flow.intakeChannels).toBe("בעיקר טלפון, וואטסאפ");
  });

  it("ניסוח חופשי על שאלה מונחית - ממשיך ל-LLM (כאן: fallback כי ה-complete זורק)", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seed(diagnoses, scans);
    const r = await runInterviewTurn(db, "d1",
      { content: "אצלנו המזכירה עונה להכל", questionKey: "lead_flow_intake", isFreeText: false },
      { complete: forbiddenComplete });
    // extractAnswer בלע את הזריקה ונפל ל-ownerNotes - הוכחה שהמסלול הגיע ל-LLM ולא לסטטי
    expect(r.usedFallback).toBe(true);
  });

  it("מצב טקסט חופשי מפורש - לא נכנס לנתיב הסטטי גם אם התוכן שווה לתווית", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seed(diagnoses, scans);
    const r = await runInterviewTurn(db, "d1",
      { content: "וואטסאפ", questionKey: "lead_flow_intake", isFreeText: true },
      { complete: forbiddenComplete });
    expect(r.usedFallback).toBe(true);
  });

  it("שני תורים סטטיים - אישורים שונים (רוטציה, לא אותו משפט)", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seed(diagnoses, scans);
    const r1 = await runInterviewTurn(db, "d1",
      { content: "וואטסאפ", questionKey: "lead_flow_intake", isFreeText: false },
      { complete: forbiddenComplete });
    const r2 = await runInterviewTurn(db, "d1",
      { content: "מחיר ותנאים", questionKey: "service_repeat", isFreeText: false },
      { complete: forbiddenComplete });
    expect(r1.reply).not.toBe(r2.reply);
  });
});
