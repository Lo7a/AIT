import { describe, expect, it } from "vitest";
import { buildRoadmap } from "../src/server/run-roadmap";
import { fallbackSentence, type CompleteFn } from "../src/pipeline/roadmap/reasoning";
import { getRoadmapView } from "../src/server/roadmap-repo";
import { makeFakeDb } from "./fakes/fake-db";
import type { ScanFindings } from "../src/pipeline/types";

// findings בסגנון עסק אמיתי אחרי סריקה: crawl תקין (websiteSignals קיים, בלי js_rendered),
// GBP קיים (partial ריק - לא no_gbp) - online_booking/whatsapp/chat_widget כולם "ידוע ולא הושג"
// (כלומר פערים אמיתיים), gbp_exists "ידוע והושג" (יש GBP)
const findings: ScanFindings = {
  business: { placeId: "p1", name: "אופטיקה בק", reviewCount: 40, rating: 4.5 },
  websiteSignals: {
    pagesCrawled: 5, crawledUrls: [], hasContactForm: true, hasWhatsappLink: false,
    hasPhoneLink: true, hasEmailLink: false, hasOnlineBooking: false, hasChatWidget: false,
    hasFacebookPixel: false, hasGoogleAnalytics: false,
  },
  partial: [],
  meta: { startedAt: "t", durationMs: 1, placesCalls: 1, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seedDiagnosis(diagnoses: any[], id = "d1", status = "report_ready") {
  diagnoses.push({ id, businessId: "b1", status, createdAt: new Date() });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seedScan(scans: any[], diagnosisId = "d1", f: ScanFindings = findings) {
  scans.push({ id: "s1", diagnosisId, findings: f, createdAt: new Date() });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seedModelWithPain(models: any[], diagnosisId: string, painQuote: string) {
  models.push({
    where: { diagnosisId },
    payload: {
      data: {
        profile: {}, channels: {}, lead_flow: {}, scheduling: {}, service: {}, billing: {},
        retention: {}, tools: {}, manual_tasks: {}, pains: { fromInterview: painQuote },
      },
      fieldSources: {},
      credits: { pains: 1 },
      completenessPct: 10,
      updatedAt: new Date(),
    },
  });
}

// מודל נגזר-סריקה בלבד (deriveBusinessModel, business-model.ts) - בדיוק כמו כל אבחון שסיים סריקה
// בפועל (saveScanResult כותב שורת מודל כזאת תמיד, גם בלי אף ראיון - ראו diagnosis-repo.ts).
// אף קרדיט לא מגיע ל-1: 0.5 הוא התקרה של סקציה שמקורה בסריקה בלבד, 1 דורש תשובת ראיון מאושרת
// (business-model.ts: "1 = אושר בראיון"). זה בדיוק מקרה קמפאי החי מהשער (בדיקה 4,
// docs/milestone-4-gate.md): מודל נגזר-סריקה בשלמות 25%.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seedScanDerivedModel(models: any[], diagnosisId: string) {
  models.push({
    where: { diagnosisId },
    payload: {
      data: {
        profile: { name: "קמפאי" }, channels: { google: true }, lead_flow: {}, scheduling: {},
        service: {}, billing: {}, retention: {}, tools: {}, pains: {}, manual_tasks: {},
      },
      fieldSources: {},
      credits: {
        profile: 0.5, channels: 0.5, lead_flow: 0, scheduling: 0.5, service: 0, billing: 0,
        retention: 0, tools: 0.5, pains: 0, manual_tasks: 0,
      },
      completenessPct: 25,
      updatedAt: new Date(),
    },
  });
}

// מודל עם סקציה בודדת בקרדיט 1 - האות היחיד לתשובת ראיון מאושרת (שאר הסקציות 0, שום דבר אחר
// מרמז על ראיון). לא קשור לפריט הנבדק עצמו בכוונה - hasInterviewModel הוא גלובלי-לאבחון, לא
// per-item, בדיוק כמו שהתוכנית מתארת ("הסקציות הרלוונטיות... עם credit>=1")
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seedModelWithConfirmedSection(models: any[], diagnosisId: string, section: string) {
  models.push({
    where: { diagnosisId },
    payload: {
      data: {
        profile: {}, channels: {}, lead_flow: {}, scheduling: {}, service: {}, billing: {},
        retention: {}, tools: {}, manual_tasks: {}, pains: {},
      },
      fieldSources: {},
      credits: { [section]: 1 },
      completenessPct: 10,
      updatedAt: new Date(),
    },
  });
}

// שני פריטי קטלוג אמיתיים (prisma/seed.ts) - שני gapKeys שונים לגמרי, כדי שהמסלול המלא ייצור
// שני items מובחנים בלי להתלכד
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seedBookingCatalog(catalogs: any[]) {
  const row = {
    id: "cat-booking",
    name: "קביעת תורים אונליין",
    problem: "כל תיאום תור דורש שיחת טלפון בשעות הפעילות - חיכוך ללקוח ועומס לצוות",
    solution: "יומן תורים אונליין (תשתית ייעודית) מוטמע באתר ובפרופיל גוגל",
    conditions: { gapKeys: ["online_booking"] },
    costRange: "100-500 בחודש",
    savingRange: "2-5 שעות תיאומים בשבוע",
    complexity: "low",
    installTime: "עד שבוע",
  };
  catalogs.push(row);
  return row;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seedWhatsappBotCatalog(catalogs: any[]) {
  const row = {
    id: "cat-whatsapp-bot",
    name: "בוט וואטסאפ לשירות לקוחות",
    problem: "שאלות חוזרות מעמיסות על הטלפון, ופניות מחוץ לשעות הפעילות אובדות",
    solution: "בוט וואטסאפ שעונה על השאלות הנפוצות 24/7 ומעביר שיחות מורכבות לצוות",
    conditions: { gapKeys: ["whatsapp", "chat_widget"] },
    costRange: "הקמה 2500-12000 + 100-900 לחודש",
    savingRange: "5-10 שעות מענה בשבוע",
    complexity: "medium",
    installTime: "1-6 שבועות לפי מורכבות",
  };
  catalogs.push(row);
  return row;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seedGbpCatalog(catalogs: any[]) {
  const row = {
    id: "cat-gbp",
    name: "הקמת פרופיל Google Business",
    problem: "העסק לא מופיע במפות גוגל - לקוחות שמחפשים בסביבה לא מוצאים אותו",
    solution: "הקמה ומילוי מלא של פרופיל העסק: פרטים, תמונות, שעות, קטגוריות ופוסטים",
    conditions: { gapKeys: ["gbp_exists"] },
    costRange: "400-2000 חד-פעמי",
    savingRange: "4-8 שעות הקמה ואימות",
    complexity: "low",
    installTime: "1-4 שבועות",
  };
  catalogs.push(row);
  return row;
}

// echo: מחזיר משפט לכל פריט המבוסס על ה-problem שלו עצמו - כדי לבדוק את היישור (item i בקלט
// -> item i בפלט) בלי תלות בסדר המיון הפנימי של buildRoadmap, ובלי לקודד מראש איזה פריט יגיע
// ראשון. בכוונה problem ולא solution: שדות ה-solution בקטלוג האמיתי יכולים להכיל ספרות (למשל
// "24/7" בבוט הוואטסאפ למטה) - אקו כזה היה נפסל ע"י שומר-הספרות של buildReasoning ונופל
// ל-fallback במקום לבדוק את מסלול ה-LLM התקין, בדיוק כמו הבאג שנתפס בסבב הראשון של הבדיקה הזו
const echoComplete: CompleteFn = async (prompt) => {
  const match = prompt.match(/<<<ITEMS>>>\n([\s\S]*?)\n<<<END>>>/);
  const items = match ? (JSON.parse(match[1]) as { problem: string }[]) : [];
  return {
    data: { sentences: items.map((it) => `נימוק עבור ${it.problem}`) },
    usage: { inputTokens: 10, outputTokens: 10 },
  };
};

describe("buildRoadmap - מסלול מלא", () => {
  it("יוצר Roadmap עם נימוק לכל פריט, ומעביר סטטוס report_ready -> roadmap_ready", async () => {
    const { db, diagnoses, scans, catalogs, models, roadmapItems, roadmaps, transitions } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, "d1", "report_ready");
    seedScan(scans, "d1");
    const booking = seedBookingCatalog(catalogs);
    const bot = seedWhatsappBotCatalog(catalogs);
    // ציטוט כאב שמזוהה למילת מפתח "תור" (matching.ts) - מצטרף להתאמה של פריט התורים
    seedModelWithPain(models, "d1", "קשה לי לתאם תורים, הלקוחות מתקשרים כל הזמן");

    const result = await buildRoadmap(db, echoComplete, "d1");

    expect(result.roadmapId).toBeTruthy();
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 10 });
    expect(roadmaps).toHaveLength(1);
    expect(transitions).toContain("report_ready→roadmap_ready");
    expect(diagnoses.find((d: any) => d.id === "d1").status).toBe("roadmap_ready");

    expect(roadmapItems).toHaveLength(2);
    const bookingItem = roadmapItems.find((it: any) => it.catalogId === booking.id);
    const botItem = roadmapItems.find((it: any) => it.catalogId === bot.id);
    expect(bookingItem.reasoning).toBe(`נימוק עבור ${booking.problem}`);
    expect(botItem.reasoning).toBe(`נימוק עבור ${bot.problem}`);
    // ציטוט הכאב על תורים אמור להעלות את הביטחון/ציון של פריט התורים
    expect(bookingItem.confidence === "high" || bookingItem.confidence === "medium").toBe(true);

    const view = await getRoadmapView(db, "d1");
    expect(view?.items).toHaveLength(2);
    expect(view?.items.every((it) => typeof it.reasoning === "string" && it.reasoning!.length > 0)).toBe(true);
    // הציונים הטריים ששימשו להתאמה עצמה גם נכתבים ל-scan.scores (סגירת שער FAIL 2, שינוי 3) -
    // ריפוי-ממילא לדוח הישן, ראו describe ייעודי למטה לבדיקת ההתנהגות הזו לעומק
    expect(scans[0].scores).toBeDefined();
  });

  it("חישוב מחדש מ-roadmap_ready יוצר Roadmap שני ונשאר roadmap_ready (בלי מעבר סטטוס נוסף)", async () => {
    const { db, diagnoses, scans, catalogs, roadmaps, transitions } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, "d1", "report_ready");
    seedScan(scans, "d1");
    seedBookingCatalog(catalogs);

    const first = await buildRoadmap(db, echoComplete, "d1");
    expect(diagnoses.find((d: any) => d.id === "d1").status).toBe("roadmap_ready");

    const second = await buildRoadmap(db, echoComplete, "d1");

    expect(second.roadmapId).not.toBe(first.roadmapId);
    expect(roadmaps).toHaveLength(2);
    expect(diagnoses.find((d: any) => d.id === "d1").status).toBe("roadmap_ready");
    // מעבר סטטוס אחד ויחיד לאורך כל הריצה - לא ניסיון שני מ-roadmap_ready
    expect(transitions.filter((t: string) => t.endsWith("→roadmap_ready"))).toHaveLength(1);
  });

  it("model=null (בלי ראיון בכלל) - עדיין עובד, מבוסס רק על ראיות מהסריקה, ואף פריט לא high", async () => {
    const { db, diagnoses, scans, catalogs, roadmapItems } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, "d1", "report_ready");
    seedScan(scans, "d1");
    seedBookingCatalog(catalogs);
    seedWhatsappBotCatalog(catalogs);
    // לא נזרע models בכלל - businessModelRow.findUnique יחזיר null, buildRoadmap צריך להתייחס ל-model=null

    const result = await buildRoadmap(db, echoComplete, "d1");

    expect(result.roadmapId).toBeTruthy();
    expect(roadmapItems).toHaveLength(2);
    expect(roadmapItems.every((it: any) => typeof it.reasoning === "string")).toBe(true);
    // תיקון ממצא שער יציאה אבן דרך 4, בדיקה 4: שני הפריטים נכנסים על ראיה ישירה מהסריקה
    // (online_booking/whatsapp+chat_widget, שני gapKeys ידועים ללא שום תלות בראיון) - בלי מודל
    // מראיון confidence לא יכול לעלות ל-high, לא משנה כמה ה-gapKeys ידועים
    expect(roadmapItems.some((it: any) => it.confidence === "high")).toBe(false);
    expect(roadmapItems.every((it: any) => it.confidence === "medium")).toBe(true);
  });

  // תיקון-המשך לממצא שער יציאה אבן דרך 4, בדיקה 4: model !== null לבדו לא סוגר את הממצא החי כי
  // כל סריקה כותבת שורת מודל נגזרת (הבדיקה הקודמת, model=null, קורית רק בבדיקת-יחידה סינתטית -
  // אף אבחון אמיתי לא מגיע למצב הזה). קמפאי בשער קיבל בדיוק מודל כזה (נגזר-סריקה, שלמות 25%) וכל
  // 3 הפריטים שלו יצאו high. hasInterviewModel חייב להיגזר מ-credits (>=1 בסקציה כלשהי), לא
  // מקיום השורה עצמה
  it("מודל נגזר-סריקה בלבד (קרדיטים <=0.5, אף סקציה לא הגיעה ל-1) - אף פריט לא high (מקרה קמפאי החי בשער)", async () => {
    const { db, diagnoses, scans, catalogs, models, roadmapItems } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, "d1", "report_ready");
    seedScan(scans, "d1");
    seedBookingCatalog(catalogs);
    seedWhatsappBotCatalog(catalogs);
    seedScanDerivedModel(models, "d1");

    const result = await buildRoadmap(db, echoComplete, "d1");

    expect(result.roadmapId).toBeTruthy();
    expect(roadmapItems).toHaveLength(2);
    expect(roadmapItems.some((it: any) => it.confidence === "high")).toBe(false);
    expect(roadmapItems.every((it: any) => it.confidence === "medium")).toBe(true);
  });

  it("מודל עם סקציה אחת בקרדיט 1 (תשובת ראיון מאושרת) - high עדיין אפשרי כשאין gapKey לא-ידוע", async () => {
    const { db, diagnoses, scans, catalogs, models, roadmapItems } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, "d1", "report_ready");
    seedScan(scans, "d1");
    const booking = seedBookingCatalog(catalogs); // online_booking ידוע מהזחילה - אין unknownKeys
    seedModelWithConfirmedSection(models, "d1", "lead_flow"); // לא קשור לפריט התורים עצמו בכוונה

    await buildRoadmap(db, echoComplete, "d1");

    const bookingItem = roadmapItems.find((it: any) => it.catalogId === booking.id);
    expect(bookingItem.confidence).toBe("high");
  });

  it("ה-LLM זורק - ה-Roadmap עדיין נוצר עם נימוק fallback דטרמיניסטי (אפס ספרות)", async () => {
    const { db, diagnoses, scans, catalogs, roadmapItems } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, "d1", "report_ready");
    seedScan(scans, "d1");
    const booking = seedBookingCatalog(catalogs);
    const bot = seedWhatsappBotCatalog(catalogs);
    const throwingComplete: CompleteFn = async () => { throw new Error("LLM down"); };

    const result = await buildRoadmap(db, throwingComplete, "d1");

    expect(result.roadmapId).toBeTruthy();
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(roadmapItems).toHaveLength(2);

    const bookingItem = roadmapItems.find((it: any) => it.catalogId === booking.id);
    const botItem = roadmapItems.find((it: any) => it.catalogId === bot.id);
    // fallback דטרמיניסטי: problem + ה-evidence הראשונה (gapText הידוע מ-dimensions.ts, בלי ספרות)
    expect(bookingItem.reasoning).toBe(fallbackSentence({
      problem: booking.problem,
      solution: booking.solution,
      evidenceTexts: ["אין קביעת תור/הזמנה אונליין, כל תיאום דורש טלפון בשעות הפעילות"],
      painQuotes: [],
    }));
    expect(botItem.reasoning).toBe(fallbackSentence({
      problem: bot.problem,
      solution: bot.solution,
      evidenceTexts: [
        "אין קישור וואטסאפ באתר, הערוץ שלקוחות ישראלים מצפים לו",
        "אין צ'אט באתר, פניות מחוץ לשעות הפעילות אובדות",
      ],
      painQuotes: [],
    }));
    expect(bookingItem.reasoning).not.toMatch(/\d/);
    expect(botItem.reasoning).not.toMatch(/\d/);
  });

  // conditions היא עמודת Json בסכמה, בלי אכיפת צורה ב-DB. שורה אחת פגומה (הוזנה ידנית, או
  // נוספה לקטלוג לפני שהוגדרו לה gapKeys) הפילה את בניית ה-Roadmap של כל האבחונים - רדיוס
  // הנזק הוא כלל-מערכתי, לא הפריט הבודד. הפריט הפגום פשוט לא מתאים לכלום, השאר ממשיכים
  it.each([
    ["conditions = null", null],
    ["conditions בלי gapKeys", { note: "טרם הוגדר" }],
    ["gapKeys שאינו מערך", { gapKeys: "online_booking" }],
  ])("שורת קטלוג פגומה (%s) לא מפילה את כל ה-Roadmap", async (_label, conditions) => {
    const { db, diagnoses, scans, catalogs, roadmapItems } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, "d1", "report_ready");
    seedScan(scans, "d1");
    const booking = seedBookingCatalog(catalogs);
    catalogs.push({ ...booking, id: "cat-broken", name: "פריט קטלוג פגום", conditions });

    const result = await buildRoadmap(db, echoComplete, "d1");

    expect(result.roadmapId).toBeTruthy();
    expect(roadmapItems.map((it: any) => it.catalogId)).toEqual([booking.id]);
  });

  it("אין התאמות (עסק חזק, אין פערים) - Roadmap ריק, בכל זאת נוצר ומעביר סטטוס", async () => {
    const { db, diagnoses, scans, catalogs, roadmaps, roadmapItems, transitions } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, "d1", "report_ready");
    seedScan(scans, "d1"); // partial: [] => gbp_exists earned=true, אין פער
    seedGbpCatalog(catalogs); // הפריט היחיד בקטלוג דורש gbp_exists בלבד - אין עליו פער ואין painQuote

    const result = await buildRoadmap(db, echoComplete, "d1");

    expect(result.roadmapId).toBeTruthy();
    expect(roadmaps).toHaveLength(1);
    expect(roadmapItems).toHaveLength(0);
    expect(transitions).toContain("report_ready→roadmap_ready");

    const view = await getRoadmapView(db, "d1");
    expect(view?.items).toEqual([]);
  });
});

describe("buildRoadmap - שמירת scores ורענון narrative (סגירת שער FAIL 2, שינוי 3)", () => {
  // מבדיל בין קריאת complete לנרטיב (narrative.ts, בלוק <<<DATA>>>) לבין קריאת complete לנימוק
  // (reasoning.ts, בלוק <<<ITEMS>>>) - buildRoadmap מזריק את אותה complete לשתיהן, וצריך לספור
  // כל אחת בנפרד כדי לוודא שהנרטיב לא מתחדש כשהציונים לא השתנו, בעוד שהנימוק כן רץ בכל בנייה
  function makeCombinedComplete(counters: { narrative: number; reasoning: number }): CompleteFn {
    return async (prompt) => {
      if (prompt.includes("<<<DATA>>>")) {
        counters.narrative++;
        return {
          data: { headline: "כותרת", summary: "סיכום", gapExplanations: [] },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      }
      counters.reasoning++;
      return echoComplete(prompt);
    };
  }

  it("כותב את הציונים הטריים ל-scan.scores", async () => {
    const { db, diagnoses, scans, catalogs } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, "d1", "report_ready");
    seedScan(scans, "d1");
    seedBookingCatalog(catalogs);

    await buildRoadmap(db, echoComplete, "d1");

    const scan = scans.find((s: any) => s.id === "s1");
    expect(scan.scores).toBeDefined();
    expect(scan.scores.overall).not.toBeUndefined();
  });

  it("נרטיב מתעדכן רק כשהציונים בפועל השתנו - בנייה שנייה עם אותם ממצאים/מודל לא קוראת שוב ל-complete בשביל נרטיב", async () => {
    const { db, diagnoses, scans, catalogs } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, "d1", "report_ready");
    seedScan(scans, "d1");
    seedBookingCatalog(catalogs);
    const counters = { narrative: 0, reasoning: 0 };
    const complete = makeCombinedComplete(counters);

    await buildRoadmap(db, complete, "d1");
    // בנייה ראשונה: אין scores שמורים קודם (null) - כל ערך נחשב "השתנה", הנרטיב מתחדש
    expect(counters.narrative).toBe(1);
    const scan1 = scans.find((s: any) => s.id === "s1");
    expect(scan1.narrative).toBeDefined();

    await buildRoadmap(db, complete, "d1"); // בנייה שנייה, אותם findings/model -> אותם scores בדיוק
    expect(counters.narrative).toBe(1); // לא נקראה שוב - הציונים זהים
    expect(counters.reasoning).toBe(2); // הנימוק כן רץ בכל בנייה, בלי תלות בשינוי ציונים
  });

  it("כשל בשמירת scores/narrative אחרי הבנייה לא מפיל את buildRoadmap", async () => {
    const { db, diagnoses, scans, catalogs, roadmapItems } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, "d1", "report_ready");
    seedScan(scans, "d1");
    seedBookingCatalog(catalogs);
    db.scan.update = async () => { throw new Error("scan update boom"); };

    const result = await buildRoadmap(db, echoComplete, "d1");

    expect(result.roadmapId).toBeTruthy();
    expect(roadmapItems.length).toBeGreaterThan(0);
    const scan = scans.find((s: any) => s.id === "s1");
    expect(scan.scores).toBeUndefined();
    expect(scan.narrative).toBeUndefined();
  });
});

describe("buildRoadmap - שגיאות", () => {
  it("אבחון לא קיים - InterviewError not_found", async () => {
    const { db } = makeFakeDb() as any;
    await expect(buildRoadmap(db, echoComplete, "אין-כזה")).rejects.toThrow(/לא נמצא/);
    await expect(buildRoadmap(db, echoComplete, "אין-כזה")).rejects.toMatchObject({ kind: "not_found" });
  });

  it("אבחון קיים בלי אף סריקה - InterviewError invalid", async () => {
    const { db, diagnoses } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, "d1", "report_ready");
    await expect(buildRoadmap(db, echoComplete, "d1")).rejects.toThrow(/סריקה/);
    await expect(buildRoadmap(db, echoComplete, "d1")).rejects.toMatchObject({ kind: "invalid" });
  });

  // כל שלושת הסטטוסים שלפני הדוח, ולא רק אחד מהם. האסרט הוא על ה-kind ועל "כלום לא נכתב" -
  // בלי זה אפשר להסיר את בדיקת ALLOWED_STATUSES לגמרי והבדיקה עדיין עוברת (מכונת המצבים זורקת
  // בהמשך שגיאה גולמית אחרת, שהייתה מתמפה ל-500 במקום ל-400)
  it.each(["created", "scanning", "scanned"])(
    "סטטוס %s לא מאפשר Roadmap - InterviewError invalid, ושום דבר לא נשמר",
    async (status) => {
      const { db, diagnoses, scans, catalogs, roadmaps, roadmapItems } = makeFakeDb() as any;
      seedDiagnosis(diagnoses, "d1", status);
      seedScan(scans, "d1");
      seedBookingCatalog(catalogs);

      await expect(buildRoadmap(db, echoComplete, "d1")).rejects.toMatchObject({
        kind: "invalid",
        message: expect.stringContaining("במצב הנוכחי"),
      });
      expect(roadmaps).toHaveLength(0);
      expect(roadmapItems).toHaveLength(0);
    },
  );

  it("כשל CAS במעבר הסטטוס (בקשה מקבילה ניצחה) - InterviewError conflict, לא שגיאה גולמית", async () => {
    const { db, diagnoses, scans, catalogs } = makeFakeDb({
      failTransitions: new Set(["report_ready→roadmap_ready"]),
    }) as any;
    seedDiagnosis(diagnoses, "d1", "report_ready");
    seedScan(scans, "d1");
    seedBookingCatalog(catalogs);

    await expect(buildRoadmap(db, echoComplete, "d1")).rejects.toMatchObject({ kind: "conflict" });
  });

  // המרוץ האמיתי: state.status נקרא לפני קריאת ה-LLM (שניות), ובקשה מקבילה יכולה להשלים
  // ולהעביר ל-roadmap_ready בזמן הזה. אז transitionDiagnosis רואה roadmap_ready->roadmap_ready
  // שאינו מעבר חוקי וזורק שגיאה גולמית - בלי טיפול היא הייתה יוצאת 500 ללקוח למרות שה-Roadmap
  // שלו נשמר בהצלחה והאבחון כבר במצב הנכון
  it("הסטטוס הגיע ל-roadmap_ready תוך כדי הריצה (בקשה מקבילה) - הצלחה, לא 500", async () => {
    const { db, diagnoses, scans, catalogs, roadmaps } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, "d1", "report_ready");
    seedScan(scans, "d1");
    seedBookingCatalog(catalogs);
    const racingComplete: CompleteFn = async (prompt) => {
      diagnoses.find((d: any) => d.id === "d1").status = "roadmap_ready"; // הבקשה המקבילה סיימה
      return echoComplete(prompt);
    };

    const result = await buildRoadmap(db, racingComplete, "d1");

    expect(result.roadmapId).toBeTruthy();
    expect(roadmaps).toHaveLength(1);
    expect(diagnoses.find((d: any) => d.id === "d1").status).toBe("roadmap_ready");
  });
});
