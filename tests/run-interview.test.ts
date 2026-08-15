import { describe, expect, it } from "vitest";
import { startInterview, runInterviewTurn, finishInterview } from "../src/server/run-interview";
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
  scans.push({ diagnosisId: "d1", findings, createdAt: new Date() });
}

const okComplete = async () => ({
  data: { updates: [{ section: "lead_flow", fields: { handler: "דנה" } }], reply: "רשמתי, דנה מטפלת." },
  usage: { inputTokens: 5, outputTokens: 5 },
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

describe("finishInterview", () => {
  it("עובר ל-report_ready", async () => {
    const { db, diagnoses, scans, transitions } = makeFakeDb() as any;
    seed(diagnoses, scans, "interviewing");
    await finishInterview(db, "d1");
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
