import { describe, expect, it } from "vitest";
import { startInterview, runInterviewTurn, finishInterview } from "../src/server/run-interview";
import { fallbackNarrative } from "../src/pipeline/report/narrative";
import { makeFakeDb } from "./fakes/fake-db";
import type { ScanFindings } from "../src/pipeline/types";

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

function seed(diagnoses: any[], scans: any[], status = "report_ready") {
  diagnoses.push({ id: "d1", businessId: "b1", status });
  scans.push({ id: "s1", diagnosisId: "d1", findings, createdAt: new Date() });
}

const okComplete = async () => ({
  data: { updates: [{ section: "lead_flow", fields: { handler: "דנה" } }], reply: "רשמתי, דנה מטפלת." },
  usage: { inputTokens: 5, outputTokens: 5 },
});

// complete תקין לרענון הנרטיב (סגירת שער FAIL 2, שינוי 2) - gapExplanations ריק כדי להימנע
// מהתלות בציוני-האמת ובמפתחות-פער האמיתיים של כל בדיקה בנפרד (אותו דפוס כמו fakeComplete
// ב-run-diagnosis.test.ts). מוזרק בכל מקום שבו finishInterview עובר בפועל דרך interviewing -
// בלי complete מפורש הוא היה נופל לברירת המחדל של generateNarrative (completeJSON אמיתי),
// שתלוי במפתח API אמיתי ובגישת רשת - אסור בבדיקת יחידה אופליין
const narrativeOk = async () => ({
  data: { headline: "כותרת רעננה", summary: "סיכום רענן", gapExplanations: [] },
  usage: { inputTokens: 2, outputTokens: 2 },
});

describe("startInterview", () => {
  it("עובר מ-report_ready ל-interviewing ומחזיר שאלה ראשונה", async () => {
    const { db, diagnoses, scans, transitions } = makeFakeDb() as any;
    seed(diagnoses, scans);
    const s = await startInterview(db, "d1");
    expect(transitions).toContain("report_ready→interviewing");
    expect(s.nextQuestion?.key).toBe("lead_flow_intake");
    expect(s.completenessPct).toBeGreaterThanOrEqual(0);
    expect(s.credits).toBeDefined();
  });

  it("כבר interviewing - לא מנסה מעבר (resume שקט)", async () => {
    const { db, diagnoses, scans, transitions } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    const s = await startInterview(db, "d1");
    expect(transitions).toEqual([]);
    expect(s.nextQuestion).not.toBeNull();
  });

  it("סטטוס שלא מאפשר ראיון (scanning) - זריקה עברית", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seed(diagnoses, scans, "scanning");
    await expect(startInterview(db, "d1")).rejects.toThrow(/ראיון/);
  });

  it("roadmap_ready - גם ממנו מתחילים ראיון (חזרה לראיון מה-Roadmap)", async () => {
    const { db, diagnoses, scans, transitions } = makeFakeDb() as any;
    seed(diagnoses, scans, "roadmap_ready");
    await startInterview(db, "d1");
    expect(transitions).toContain("roadmap_ready→interviewing");
  });
});

describe("runInterviewTurn", () => {
  it("תור מלא: חילוץ, מיזוג, שמירה, שאלה הבאה", async () => {
    const { db, diagnoses, scans, messages, models } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    const r = await runInterviewTurn(db, "d1",
      { content: "דנה עונה תוך שעה", questionKey: "lead_flow_intake", isFreeText: false },
      { complete: okComplete });
    expect(r.reply).toContain("דנה");
    // okComplete מחזיר עדכון לסקציית lead_flow - הסקציה מזוכה (קרדיט 1), אז pickNextQuestion
    // מדלג עליה כולה וקופץ לסקציה החסרה הבאה בתור, לא לשאלה השנייה של lead_flow עצמה
    expect(r.nextQuestion?.key).toBe("service_repeat");
    expect(r.completenessPct).toBeGreaterThan(0);
    expect(messages).toHaveLength(2);
    expect(models).toHaveLength(1);
    expect(r.done).toBe(false);
    expect(r.askedCount).toBe(1);
    expect(r.credits.lead_flow).toBe(1);
  });

  it("עקביות resume: השאלה הבאה שהתור מחזיר זהה למה ש-startInterview מחשב מיד אחר כך", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    const r = await runInterviewTurn(db, "d1",
      { content: "דנה עונה תוך שעה", questionKey: "lead_flow_intake", isFreeText: false },
      { complete: okComplete });
    const resumed = await startInterview(db, "d1");
    expect(resumed.nextQuestion?.key).toBe(r.nextQuestion?.key);
  });

  it("רזרבת עומק: תשובה שלא זיכתה את הסקציה מובילה לשאלה השנייה באותה סקציה", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    const r = await runInterviewTurn(db, "d1",
      { content: "לא בטוח", questionKey: "lead_flow_intake", isFreeText: false },
      { complete: async () => ({ data: { updates: [], reply: "לא הבנתי" }, usage: { inputTokens: 1, outputTokens: 1 } }) });
    expect(r.nextQuestion?.key).toBe("lead_flow_lost");
  });

  it("סטטוס לא interviewing - זריקה, כלום לא נשמר", async () => {
    const { db, diagnoses, scans, messages } = makeFakeDb() as any;
    seed(diagnoses, scans, "report_ready");
    await expect(runInterviewTurn(db, "d1", { content: "א", isFreeText: true }, { complete: okComplete }))
      .rejects.toThrow(/ראיון/);
    expect(messages).toHaveLength(0);
  });

  it("questionKey לא מוכר - זריקה עברית לפני כל שמירה", async () => {
    const { db, diagnoses, scans, messages } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    await expect(runInterviewTurn(db, "d1", { content: "א", questionKey: "לא-קיים", isFreeText: false }, { complete: okComplete }))
      .rejects.toThrow(/שאלה/);
    expect(messages).toHaveLength(0);
  });

  it("תשובה ריקה - זריקה עברית", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    await expect(runInterviewTurn(db, "d1", { content: "   ", isFreeText: true }, { complete: okComplete }))
      .rejects.toThrow(/ריקה/);
  });

  it("חילוץ שנפל (fallback) - התור עדיין נשמר ו-usedFallback מדווח", async () => {
    const { db, diagnoses, scans, messages } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    const r = await runInterviewTurn(db, "d1",
      { content: "מזומן בלבד", questionKey: "billing_flow", isFreeText: false },
      { complete: async () => { throw new Error("down"); } });
    expect(r.usedFallback).toBe(true);
    expect(messages).toHaveLength(2);
    expect(r.completenessPct).toBeGreaterThan(0);
  });

  it("free-text מעדכן עם מקור free_text", async () => {
    const { db, diagnoses, scans, models } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    await runInterviewTurn(db, "d1", { content: "יש לי צוות של 3", isFreeText: true }, {
      complete: async () => ({
        data: { updates: [{ section: "profile", fields: { teamSize: 3 } }], reply: "צוות של 3, רשמתי" },
        usage: { inputTokens: 1, outputTokens: 1 },
      }),
    });
    const saved = models[models.length - 1];
    const fs = (saved.create ?? saved.update).fieldSources;
    expect(fs.profile).toContain("free_text");
  });
});

describe("runInterviewTurn - רענון scores תוך כדי הראיון (סגירת שער FAIL 2, שינוי 1)", () => {
  it("אחרי תור - scan.scores מתעדכן מיידית, לא רק בסיום הראיון", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    await runInterviewTurn(db, "d1",
      { content: "אני עונה תוך שעה", questionKey: "lead_flow_intake", isFreeText: false },
      {
        complete: async () => ({
          data: {
            updates: [{ section: "lead_flow", fields: { whoHandles: "בעל העסק", responseTime: "תוך שעה" } }],
            reply: "רשמתי",
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
      });
    const scan = scans.find((s: any) => s.id === "s1");
    expect(scan.scores).toBeDefined();
    const process = scan.scores.dimensions.find((d: any) => d.key === "process");
    expect(process.score).not.toBeNull();
    const leadRule = process.rules.find((r: any) => r.key === "lead_handling");
    expect(leadRule.known).toBe(true);
    expect(leadRule.earned).toBe(true);
  });

  it("כשל בכתיבת scores תוך כדי תור - לא מפיל את התור, התשובה עדיין נשמרת", async () => {
    const { db, diagnoses, scans, messages } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    db.scan.update = async () => { throw new Error("scan update boom"); };
    const r = await runInterviewTurn(db, "d1",
      { content: "דנה עונה תוך שעה", questionKey: "lead_flow_intake", isFreeText: false },
      { complete: okComplete });
    expect(r.reply).toContain("דנה");
    expect(messages).toHaveLength(2); // ההחלפה עצמה נשמרה - הכשל ברענון לא גלגל אותה אחורה
    const scan = scans.find((s: any) => s.id === "s1");
    expect(scan.scores).toBeUndefined();
  });
});

describe("finishInterview", () => {
  it("עובר ל-report_ready", async () => {
    const { db, diagnoses, scans, transitions } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    await finishInterview(db, "d1", { complete: narrativeOk });
    expect(transitions).toContain("interviewing→report_ready");
  });

  it("כבר report_ready - no-op שקט, בלי מעברים נרשמים", async () => {
    const { db, diagnoses, scans, transitions } = makeFakeDb() as any;
    seed(diagnoses, scans, "report_ready");
    await finishInterview(db, "d1");
    expect(transitions).toEqual([]);
  });

  it("אבחון לא קיים - זריקה עברית 404 (לא שגיאת Prisma)", async () => {
    const { db } = makeFakeDb() as any;
    await expect(finishInterview(db, "אין")).rejects.toThrow(/לא נמצא/);
  });

  // roadmap_ready->report_ready אינו מעבר חוקי במכונת המצבים (status.ts) - בלי הבדיקה הייעודית
  // ב-finishInterview, סיום ראיון שכבר חזר אליו מ-Roadmap היה מנסה מעבר לא-חוקי ומקבל 409/500
  // מזויף במקום להתנהג בדיוק כמו report_ready ("הראיון כבר סגור, אין מה לעשות")
  it("roadmap_ready - no-op שקט כמו report_ready, בלי ניסיון מעבר לא-חוקי", async () => {
    const { db, diagnoses, scans, transitions } = makeFakeDb() as any;
    seed(diagnoses, scans, "roadmap_ready");
    await finishInterview(db, "d1");
    expect(transitions).toEqual([]);
  });
});

describe("finishInterview - רענון scores (אבן דרך 4, משימה 1)", () => {
  it("סוגר ראיון שהזכה lead_flow - מחשב מחדש scores ושומר על שורת הסריקה", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    await runInterviewTurn(db, "d1",
      { content: "אני עונה תוך שעה", questionKey: "lead_flow_intake", isFreeText: false },
      {
        complete: async () => ({
          data: {
            updates: [{ section: "lead_flow", fields: { whoHandles: "בעל העסק", responseTime: "תוך שעה" } }],
            reply: "רשמתי",
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
      });
    await finishInterview(db, "d1", { complete: narrativeOk });
    const scan = scans.find((s: any) => s.id === "s1");
    expect(scan.scores).toBeDefined();
    const process = scan.scores.dimensions.find((d: any) => d.key === "process");
    expect(process.score).not.toBeNull();
    const leadRule = process.rules.find((r: any) => r.key === "lead_handling");
    expect(leadRule.known).toBe(true);
    expect(leadRule.earned).toBe(true);
  });

  it("no-op מ-report_ready - לא נוגע ב-scores", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seed(diagnoses, scans, "report_ready");
    await finishInterview(db, "d1");
    const scan = scans.find((s: any) => s.id === "s1");
    expect(scan.scores).toBeUndefined();
  });

  it("no-op מ-roadmap_ready - לא נוגע ב-scores", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seed(diagnoses, scans, "roadmap_ready");
    await finishInterview(db, "d1");
    const scan = scans.find((s: any) => s.id === "s1");
    expect(scan.scores).toBeUndefined();
  });

  it("ראיון מלא בסגנון אופטיקה בק (lead_flow/service/billing/manual_tasks) - בשלות תהליכים מקבלת ציון אמיתי בדוח המרוענן", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    const turn = (content: string, questionKey: string, data: unknown) =>
      runInterviewTurn(db, "d1", { content, questionKey, isFreeText: false }, {
        complete: async () => ({ data, usage: { inputTokens: 1, outputTokens: 1 } }),
      });
    await turn("אשתי עונה כשהיא בחנות ואני עונה בערב, תוך שעה בערך", "lead_flow_intake", {
      updates: [{
        section: "lead_flow",
        fields: { whoHandles: "האישה עונה בחנות, בעל העסק עונה בערב", responseTime: "עד שעה" },
      }],
      reply: "רשמתי, תודה",
    });
    await turn("שואלים על מחיר בדיקה וביטוחים", "service_repeat", {
      updates: [{ section: "service", fields: { recurringQuestions: "מחיר בדיקה, ביטוחים" } }],
      reply: "הבנתי",
    });
    await turn("חשבוניות אני מוציא בחשבשבת", "billing_tool", {
      updates: [{ section: "billing", fields: { invoiceTool: "חשבשבת" } }],
      reply: "רשמתי",
    });
    await turn("רישום ביומן ידני, שיחות כשמוכן, תזכורות ידניות", "manual_tasks_top", {
      updates: [{ section: "manual_tasks", fields: { manualTasks: "רישום ביומן ידני, שיחות כשמוכן, תזכורות ידניות" } }],
      reply: "רשמתי",
    });
    await finishInterview(db, "d1", { complete: narrativeOk });
    const scan = scans.find((s: any) => s.id === "s1");
    const process = scan.scores.dimensions.find((d: any) => d.key === "process");
    expect(process.score).not.toBeNull();
    expect(process.dataStatus).not.toBe("none");
    const leadRule = process.rules.find((r: any) => r.key === "lead_handling");
    const manualRule = process.rules.find((r: any) => r.key === "manual_tasks");
    expect(leadRule.known).toBe(true);
    expect(leadRule.earned).toBe(true);
    expect(manualRule.known).toBe(true);
    expect(manualRule.earned).toBe(false); // יש עבודה ידנית מדווחת - פער אמיתי, לא "אין מידע"
    expect(manualRule.text).toContain("רישום ביומן ידני");
  });

  // סקירת קוד (סבב 2, M4): המעבר ל-report_ready כבר הצליח למעלה כשהכתיבה הזו נכשלת - שגיאה
  // כאן חייבת להיבלע (כמו step 5/5ב ב-run-diagnosis.ts), אחרת ה-caller חושב שהראיון לא נסגר
  // כשבפועל הוא כן נסגר, וניסיון חוזר לא מתקן כלום (finishInterview על report_ready הוא no-op)
  it("כשל בכתיבת scores אחרי סיום - לא מפיל את finishInterview (המעבר כבר הצליח, זה קוסמטי)", async () => {
    const { db, diagnoses, scans, transitions } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    db.scan.update = async () => { throw new Error("scan update boom"); };
    // complete שזורק מפורש (לא ברירת המחדל) - כך שגם ניסיון רענון הנרטיב (שינוי 2) לא תלוי
    // ברשת/מפתח API אמיתי; generateNarrative עצמו בולע את הכשל הזה ומחזיר fallback, שהכתיבה
    // שלו ל-DB נכשלת גם היא באותו override
    await expect(finishInterview(db, "d1", { complete: async () => { throw new Error("no network in tests"); } }))
      .resolves.toBeUndefined();
    expect(transitions.some((t: string) => t.startsWith("interviewing") && t.endsWith("report_ready"))).toBe(true);
    const scan = scans.find((s: any) => s.id === "s1");
    expect(scan.scores).toBeUndefined(); // הכתיבה נכשלה - לא נשאר עם scores חלקיים/פגומים
    expect(scan.narrative).toBeUndefined(); // אותו override מפיל גם את כתיבת הנרטיב - לא נשאר עם נרטיב חלקי
  });

  // סקירת קוד (סבב 2, M5): מוטציה שהופכת orderBy desc ל-asc ב-scan.findFirst הייתה שורדת בלי
  // בדיקה עם סריקה בודדת לכל אבחון - שתי סריקות עם createdAt שונה חושפות את זה
  it("שתי סריקות לאותו אבחון - הרענון כותב לשורה החדשה ביותר בלבד", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    diagnoses.push({ id: "d1", businessId: "b1", status: "interviewing" });
    const oldFindings: ScanFindings = { ...findings, business: { ...findings.business, name: "עסק ישן" } };
    const newFindings: ScanFindings = { ...findings, business: { ...findings.business, name: "עסק חדש" } };
    scans.push({ id: "s-old", diagnosisId: "d1", findings: oldFindings, createdAt: new Date("2026-01-01") });
    scans.push({ id: "s-new", diagnosisId: "d1", findings: newFindings, createdAt: new Date("2026-02-01") });
    await finishInterview(db, "d1", { complete: narrativeOk });
    const oldScan = scans.find((s: any) => s.id === "s-old");
    const newScan = scans.find((s: any) => s.id === "s-new");
    expect(oldScan.scores).toBeUndefined();
    expect(newScan.scores).toBeDefined();
  });
});

describe("finishInterview - רענון narrative (סגירת שער FAIL 2, שינוי 2)", () => {
  it("מייצר ושומר נרטיב טרי מהציונים המרועננים", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    scans.find((s: any) => s.id === "s1").narrative = {
      narrative: { headline: "כותרת ישנה מלפני הראיון", summary: "ישן", gapExplanations: [] },
      usage: { inputTokens: 0, outputTokens: 0 }, usedFallback: false,
    };
    await runInterviewTurn(db, "d1",
      { content: "אני עונה תוך שעה", questionKey: "lead_flow_intake", isFreeText: false },
      { complete: okComplete });
    await finishInterview(db, "d1", { complete: narrativeOk });
    const scan = scans.find((s: any) => s.id === "s1");
    expect(scan.narrative.narrative.headline).toBe("כותרת רעננה");
    expect(scan.narrative.usedFallback).toBe(false);
  });

  it("כשל LLM (429/רשת) - נשמר הנרטיב הדטרמיניסטי של generateNarrative עצמו (usedFallback: true), לא נזרק", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    await expect(finishInterview(db, "d1", { complete: async () => { throw new Error("429"); } }))
      .resolves.toBeUndefined();
    const scan = scans.find((s: any) => s.id === "s1");
    expect(scan.narrative).toBeDefined();
    expect(scan.narrative.usedFallback).toBe(true);
    // הפולבק הדטרמיניסטי בנוי מ-fallbackNarrative(findings, scores) - עקבי עם הציונים הטריים
    // שנכתבו על אותה שורה, לא עם מה שהיה שמור לפני סיום הראיון
    expect(scan.narrative.narrative.headline).toBe(fallbackNarrative(findings, scan.scores).headline);
  });

  it("קריסה קשה בשלב שמירת הנרטיב - הנרטיב הישן נשאר, finishInterview עדיין מצליח", async () => {
    const { db, diagnoses, scans, transitions } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    const oldNarrative = {
      narrative: { headline: "כותרת ישנה", summary: "ישן", gapExplanations: [] },
      usage: { inputTokens: 0, outputTokens: 0 }, usedFallback: false,
    };
    scans.find((s: any) => s.id === "s1").narrative = oldNarrative;
    const originalUpdate = db.scan.update;
    // הכתיבה של scores (data.scores) עדיין עוברת דרך המימוש האמיתי; רק כתיבת narrative קורסת -
    // מדמה כשל DB אמיתי בצעד הנרטיב בלבד, בלי לגעת ברענון ה-scores הרגיל
    db.scan.update = async (args: any) => {
      if (args.data.narrative) throw new Error("narrative write boom");
      return originalUpdate(args);
    };
    await expect(finishInterview(db, "d1", { complete: narrativeOk })).resolves.toBeUndefined();
    expect(transitions).toContain("interviewing→report_ready");
    const scan = scans.find((s: any) => s.id === "s1");
    expect(scan.narrative).toEqual(oldNarrative); // הנרטיב הישן נשאר בדיוק כפי שהיה
    expect(scan.scores).toBeDefined(); // רענון ה-scores הרגיל (שינוי 1/הישן) עדיין הצליח
  });

  it("no-op מ-report_ready - לא נוגע בנרטיב", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seed(diagnoses, scans, "report_ready");
    await finishInterview(db, "d1", { complete: narrativeOk });
    const scan = scans.find((s: any) => s.id === "s1");
    expect(scan.narrative).toBeUndefined();
  });
});
