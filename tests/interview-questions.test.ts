import { describe, expect, it } from "vitest";
import {
  QUESTION_BANK, MAX_GUIDED_QUESTIONS, CLOSING_QUESTION_KEY, pickNextQuestion,
} from "../src/pipeline/interview/questions";
import { normalizeTypography } from "../src/pipeline/interview/extract";
import { LEAD_DROP_RE } from "../src/pipeline/score/dimensions";
import { deriveBusinessModel } from "../src/pipeline/model/business-model";
import type { ScanFindings } from "../src/pipeline/types";

const richFindings: ScanFindings = {
  business: { placeId: "p1", name: "אופטיקה בק", rating: 4.9, reviewCount: 80, website: "https://x.co.il" },
  websiteSignals: {
    pagesCrawled: 8, crawledUrls: [], hasContactForm: true, hasWhatsappLink: true,
    hasPhoneLink: true, hasEmailLink: false, hasOnlineBooking: false, hasChatWidget: false,
    hasFacebookPixel: false, hasGoogleAnalytics: true, platform: "wordpress",
  },
  partial: [],
  meta: { startedAt: "t", durationMs: 1, placesCalls: 1, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 },
};

const REGULAR_KEYS = QUESTION_BANK.filter((q) => q.key !== CLOSING_QUESTION_KEY).map((q) => q.key);

// שאלות שנועדו לבחירה מרובה, נעולות במפורש (אפיון מחדש-ראיון, החלטה A) - כדי שכל שינוי
// עתידי בתכן הבנק יצטרך לעדכן את הרשימה הזו במודע, לא בטעות
const MULTI_SELECT_KEYS = new Set([
  "lead_flow_intake", "service_repeat", "billing_flow", "manual_tasks_top", "channels_main", "tools_used",
]);

describe("QUESTION_BANK", () => {
  it("15 שאלות (14 רגילות + שאלת סיכום), מפתחות ייחודיים, כולן עם סקציה חוקית", () => {
    expect(QUESTION_BANK).toHaveLength(MAX_GUIDED_QUESTIONS);
    expect(MAX_GUIDED_QUESTIONS).toBe(15);
    expect(REGULAR_KEYS).toHaveLength(14);
    expect(new Set(QUESTION_BANK.map((q) => q.key)).size).toBe(15);
  });

  it("אין שאלה רגילה על pains - כאבים עולים מתשובות/כתיבה חופשית; רק שאלת הסיכום ממוענת ל-pains", () => {
    const regular = QUESTION_BANK.filter((q) => q.key !== CLOSING_QUESTION_KEY);
    expect(regular.every((q) => q.section !== "pains")).toBe(true);
    const closing = QUESTION_BANK.find((q) => q.key === CLOSING_QUESTION_KEY);
    expect(closing?.section).toBe("pains");
  });

  it("פותחן תלוי-הקשר: כשיש טופס באתר, שאלת הלידים מזכירה אותו", () => {
    const model = deriveBusinessModel(richFindings);
    const q = QUESTION_BANK.find((x) => x.key === "lead_flow_intake")!;
    expect(q.text(richFindings, model)).toContain("טופס");
    const bare: ScanFindings = { ...richFindings, websiteSignals: undefined };
    expect(q.text(bare, deriveBusinessModel(bare))).not.toContain("טופס");
  });

  it("כל שאלה רגילה: 3-5 אפשרויות, תוויות לא ריקות, בלי תווים אסורים (מקף ארוך/אליפסיס/אימוג'י וכו')", () => {
    const regular = QUESTION_BANK.filter((q) => q.key !== CLOSING_QUESTION_KEY);
    for (const q of regular) {
      expect(q.options, `לשאלה ${q.key} חייבות להיות אפשרויות`).toBeDefined();
      const options = q.options!;
      expect(options.length, `${q.key}: מספר אפשרויות`).toBeGreaterThanOrEqual(3);
      expect(options.length, `${q.key}: מספר אפשרויות`).toBeLessThanOrEqual(5);
      for (const o of options) {
        expect(o.label.trim().length, `${q.key}: תווית ריקה`).toBeGreaterThan(0);
        // normalizeTypography אידמפוטנטי על טקסט "נקי" - אם התווית הכילה תו אסור
        // (מקף ארוך/בינוני/אליפסיס/סימוני כיווניות/אימוג'י וכו') הפונקציה הייתה משנה אותה
        expect(normalizeTypography(o.label), `${q.key}: תווית עם תו אסור: "${o.label}"`).toBe(o.label);
      }
    }
  });

  it("שאלת הסיכום: בלי options - תמיד נופלת לטקסט חופשי בצד ה-UI", () => {
    const closing = QUESTION_BANK.find((q) => q.key === CLOSING_QUESTION_KEY)!;
    expect(closing.options).toBeUndefined();
    expect(closing.multiSelect).toBeUndefined();
  });

  it("שאלת הסיכום: הטקסט המדויק שנקבע (כאב + תוספת חופשית באותה שאלה)", () => {
    const closing = QUESTION_BANK.find((q) => q.key === CLOSING_QUESTION_KEY)!;
    const model = deriveBusinessModel(richFindings);
    expect(closing.text(richFindings, model)).toBe(
      "לפני שמסיימים - מה הכי מציק לך בעסק היום? ואם יש עוד משהו שחשוב שנדע, זה המקום",
    );
  });

  it("multiSelect מסומן בדיוק על השאלות שנועדו לבחירה מרובה (ערוצים/כלים) - לא על כל השאר", () => {
    for (const q of QUESTION_BANK) {
      if (q.key === CLOSING_QUESTION_KEY) continue;
      expect(!!q.multiSelect, `${q.key}: multiSelect`).toBe(MULTI_SELECT_KEYS.has(q.key));
    }
  });

  it("הצלבה מול LEAD_DROP_RE: לשאלת lead_flow_lost יש אפשרות שמנוסחת כך שתתאים לרג'קס נפילת פניות", () => {
    const q = QUESTION_BANK.find((x) => x.key === "lead_flow_lost")!;
    expect(q.options!.some((o) => LEAD_DROP_RE.test(o.label))).toBe(true);
  });

  // שאלות כמות (תוספת שאושרה על ידי המייסד): נתונים מספריים לחישובי "מה אתה מפסיד" עתידיים -
  // חייבים להיות טווחים כנים (לא נקודתיים), verbatim במודל, ובחירה בודדת (לא natural-multi)
  describe("שאלות כמות/טווח", () => {
    it("lead_flow_volume: השאלה על נפח פניות שבועי, בדיוק הטקסט וטווחי האפשרויות שאושרו", () => {
      const q = QUESTION_BANK.find((x) => x.key === "lead_flow_volume")!;
      expect(q.section).toBe("lead_flow");
      expect(q.text(richFindings, deriveBusinessModel(richFindings))).toBe("כמה פניות בערך מגיעות לעסק בשבוע?");
      expect(q.options!.map((o) => o.label)).toEqual(["עד 10", "10-30", "30-100", "מעל 100"]);
      expect(q.multiSelect).toBeFalsy();
    });

    it("lead_flow_response_time: שאלת זמן תגובה עם טווחים כנים במקום ניסוח מעורפל", () => {
      const q = QUESTION_BANK.find((x) => x.key === "lead_flow_response_time")!;
      expect(q.section).toBe("lead_flow");
      expect(q.text(richFindings, deriveBusinessModel(richFindings))).toBe("תוך כמה זמן בערך אתם חוזרים ללקוח שפנה?");
      expect(q.options!.map((o) => o.label)).toEqual(["תוך דקות", "תוך שעה-שעתיים", "באותו יום", "יום-יומיים ומעלה"]);
      expect(q.multiSelect).toBeFalsy();
    });

    it("שתי שאלות הכמות נמצאות אחרי lead_flow_lost בסדר הבנק - לא פוגעות ברזרבת העומק הקיימת", () => {
      const keys = REGULAR_KEYS;
      expect(keys.indexOf("lead_flow_volume")).toBeGreaterThan(keys.indexOf("lead_flow_lost"));
      expect(keys.indexOf("lead_flow_response_time")).toBeGreaterThan(keys.indexOf("lead_flow_volume"));
    });
  });
});

describe("pickNextQuestion", () => {
  it("מתחיל מהסקציה הראשונה בעדיפות שקרדיטה מתחת ל-1 (lead_flow)", () => {
    const model = deriveBusinessModel(richFindings);
    const q = pickNextQuestion(model, richFindings, []);
    expect(q?.section).toBe("lead_flow");
    expect(q?.key).toBe("lead_flow_intake");
  });

  it("מדלג על שאלות שכבר נשאלו בתוך הסקציה", () => {
    const model = deriveBusinessModel(richFindings);
    const q = pickNextQuestion(model, richFindings, ["lead_flow_intake"]);
    expect(q?.key).toBe("lead_flow_lost");
  });

  it("סקציה עם קרדיט 1 מדולגת כולה", () => {
    const model = deriveBusinessModel(richFindings);
    model.credits.lead_flow = 1;
    const q = pickNextQuestion(model, richFindings, []);
    expect(q?.section).toBe("service");
  });

  it("אחרי כל השאלות הרגילות שנשאלו - שאלת הסיכום היא הצעד הבא (לא null)", () => {
    const model = deriveBusinessModel(richFindings);
    const q = pickNextQuestion(model, richFindings, REGULAR_KEYS);
    expect(q?.key).toBe(CLOSING_QUESTION_KEY);
  });

  it("אחרי שגם שאלת הסיכום נשאלה - null (הראיון המונחה מוצה סופית)", () => {
    const model = deriveBusinessModel(richFindings);
    const q = pickNextQuestion(model, richFindings, [...REGULAR_KEYS, CLOSING_QUESTION_KEY]);
    expect(q).toBeNull();
  });

  it("כשכל הסקציות (כולל pains) בקרדיט 1 - שאלת הסיכום עדיין מוצעת, לא מדולגת", () => {
    // כולל pains בכוונה (Object.keys(model.credits) מכסה את כל MODEL_SECTIONS, גם pains) - מדמה
    // תרחיש שבו תשובה על שאלה אחרת לגמרי חילצה בטעות עדכון לסקציית pains (הפרומפט ב-extract.ts
    // מרשה למודל לבחור כל סקציה, לא רק את זו של השאלה הנוכחית - ראו הערת as-built ב-questions.ts).
    // שאלת הסיכום משוערת רק לפי חברות ב-askedKeys, לעולם לא לפי קרדיט pains - אז היא לא נבלעת כאן
    const model = deriveBusinessModel(richFindings);
    for (const k of Object.keys(model.credits)) model.credits[k as keyof typeof model.credits] = 1;
    expect(pickNextQuestion(model, richFindings, [])?.key).toBe(CLOSING_QUESTION_KEY);
  });

  it("התקרה הקשיחה של הבנק הרגיל עומדת בפני עצמה, גם כשהמפתחות שנשאלו אינם מהבנק - עדיין נופל לשאלת הסיכום", () => {
    const asked = Array.from({ length: REGULAR_KEYS.length }, (_, i) => `not_in_bank_${i}`);
    const q = pickNextQuestion(deriveBusinessModel(richFindings), richFindings, asked);
    expect(q?.key).toBe(CLOSING_QUESTION_KEY);
  });

  it("רזרבת עומק: תשובה שלא זיכתה סקציה עם שתי שאלות (lead_flow) עוברת לשאלה השנייה, לא ישר לסיכום", () => {
    const model = deriveBusinessModel(richFindings);
    const q = pickNextQuestion(model, richFindings, ["lead_flow_intake"]);
    expect(q?.key).toBe("lead_flow_lost");
    expect(q?.key).not.toBe(CLOSING_QUESTION_KEY);
  });
});
