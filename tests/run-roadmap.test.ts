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
    // הציונים הטריים מחושבים בזיכרון בלבד - עמודת scan.scores היא באחריות finishInterview
    // (אבן דרך 4, משימה 1) ו-buildRoadmap לא נוגע בה
    expect(scans[0].scores).toBeUndefined();
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

  it("model=null (בלי ראיון בכלל) - עדיין עובד, מבוסס רק על ראיות מהסריקה", async () => {
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
