import { describe, expect, it } from "vitest";
import {
  QUESTION_BANK, MAX_GUIDED_QUESTIONS, CLOSING_QUESTION_KEY, REQUIRED_QUESTION_KEYS,
  pickNextQuestion, staticUpdateFor, interviewPlan, answerLabels,
} from "../src/pipeline/interview/questions";
import { applyInterviewUpdates } from "../src/pipeline/interview/merge";
import { normalizeTypography } from "../src/pipeline/interview/extract";
import { LEAD_DROP_RE } from "../src/pipeline/score/dimensions";
import { deriveBusinessModel, type BusinessModel } from "../src/pipeline/model/business-model";
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
  it("16 שאלות (15 רגילות + שאלת סיכום), מפתחות ייחודיים, כולן עם סקציה חוקית", () => {
    expect(QUESTION_BANK).toHaveLength(MAX_GUIDED_QUESTIONS);
    expect(MAX_GUIDED_QUESTIONS).toBe(16);
    expect(REGULAR_KEYS).toHaveLength(15);
    expect(new Set(QUESTION_BANK.map((q) => q.key)).size).toBe(16);
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

    it("lead_flow_deal_value: שווי לקוח/עסקה, טווחי שקלים שבעל העסק בוחר בעצמו", () => {
      const q = QUESTION_BANK.find((x) => x.key === "lead_flow_deal_value")!;
      expect(q.section).toBe("lead_flow");
      expect(q.field).toBe("avgDealValue");
      expect(q.text(richFindings, deriveBusinessModel(richFindings))).toBe("כמה שווה בממוצע לקוח או עסקה אצלכם?");
      expect(q.options!.map((o) => o.label)).toEqual([
        "עד 300 שקל", "300-1,000 שקל", "1,000-5,000 שקל", "מעל 5,000 שקל",
      ]);
      expect(q.multiSelect).toBeFalsy();
    });

    it("שלוש שאלות הכמות בסדר שנקבע: כמות, זמן תגובה ואז שווי (שאלת הכסף אחרונה)", () => {
      const keys = REGULAR_KEYS;
      expect(keys.indexOf("lead_flow_volume")).toBeGreaterThan(keys.indexOf("lead_flow_lost"));
      expect(keys.indexOf("lead_flow_response_time")).toBeGreaterThan(keys.indexOf("lead_flow_volume"));
      expect(keys.indexOf("lead_flow_deal_value")).toBeGreaterThan(keys.indexOf("lead_flow_response_time"));
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

  it("אחרי שאלת הפתיחה מגיעות שאלות הכסף, לא השאלה הבאה בסקציה (משימה 7)", () => {
    const model = deriveBusinessModel(richFindings);
    const q = pickNextQuestion(model, richFindings, ["lead_flow_intake"]);
    expect(q?.key).toBe("lead_flow_volume");
  });

  it("מדלג על שאלות שכבר נשאלו בתוך הסקציה", () => {
    const model = deriveBusinessModel(richFindings);
    // אחרי שאלות החובה, סבב הרוחב חוזר לסקציה שנשאלה הכי מעט - וכאן service_repeat כבר נשאלה
    const asked = ["lead_flow_intake", ...REQUIRED_QUESTION_KEYS, "service_repeat"];
    const q = pickNextQuestion(model, richFindings, asked);
    expect(q?.key).toBe("billing_flow");
  });

  it("קרדיט סקציה כבר לא מדלג על שאלות - זה היה שורש באג הכסף (משימה 7)", () => {
    // קרדיט lead_flow=1 הוא בדיוק מה שקורה בייצור אחרי התשובה הראשונה (merge.ts). קודם זה
    // מחק את ארבע שאלות ההמשך של הסקציה, ובהן שלוש שאלות הכסף. עכשיו הקרדיט לא משתתף בבחירה
    const model = deriveBusinessModel(richFindings);
    model.credits.lead_flow = 1;
    expect(pickNextQuestion(model, richFindings, [])?.key).toBe("lead_flow_intake");
    expect(pickNextQuestion(model, richFindings, ["lead_flow_intake"])?.key).toBe("lead_flow_volume");
  });

  it("סבב רוחב: אחרי שאלות הכסף עוברים לסקציה שנשאלה הכי מעט, לא נשארים ב-lead_flow", () => {
    const model = deriveBusinessModel(richFindings);
    const asked = ["lead_flow_intake", ...REQUIRED_QUESTION_KEYS];
    const q = pickNextQuestion(model, richFindings, asked);
    // ל-lead_flow נותרה lead_flow_lost, אבל היא נשאלה כבר 4 פעמים וכל השאר אפס
    expect(q?.section).toBe("service");
    expect(q?.key).toBe("service_repeat");
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
    // שאלת הסיכום משוערת רק לפי חברות ב-askedKeys, לעולם לא לפי קרדיט pains - אז היא לא נבלעת כאן.
    // askedKeys מכיל את שאלות החובה כי הן קודמות לשאלת הסיכום בכל מקרה (ניקוז החובה) - הנקודה
    // הנבדקת כאן היא שקרדיט pains עצמו לא בולע את שאלת הסיכום, לא סדר הניקוז
    const model = deriveBusinessModel(richFindings);
    for (const k of Object.keys(model.credits)) model.credits[k as keyof typeof model.credits] = 1;
    expect(pickNextQuestion(model, richFindings, REGULAR_KEYS)?.key).toBe(CLOSING_QUESTION_KEY);
  });

  it("התקרה הקשיחה של הבנק הרגיל עומדת בפני עצמה, גם כשהמפתחות שנשאלו אינם מהבנק - עדיין נופל לשאלת הסיכום", () => {
    // חלה גם על ניקוז שאלות החובה (DRAIN_CAP): הן פטורות מתקרת הבנק הרגיל אבל לא מהתקרה
    // המוחלטת, כך שסך השאלות המונחות חסום ב-MAX_GUIDED_QUESTIONS לכל קלט askedKeys שהוא
    const asked = Array.from({ length: REGULAR_KEYS.length }, (_, i) => `not_in_bank_${i}`);
    const q = pickNextQuestion(deriveBusinessModel(richFindings), richFindings, asked);
    expect(q?.key).toBe(CLOSING_QUESTION_KEY);
  });

  it("רזרבת עומק: השאלה השנייה של סקציה חוזרת בסיבוב הבא, לא נופלת בשקט", () => {
    // lead_flow_lost אינה שאלת חובה ולכן היא ממתינה לסיבוב השני של סבב הרוחב. הנקודה: היא
    // עדיין מגיעה, ולא נמחקת כמו שקרה כשקרדיט הסקציה היה השער
    const model = deriveBusinessModel(richFindings);
    const asked = REGULAR_KEYS.filter((k) => k !== "lead_flow_lost");
    const q = pickNextQuestion(model, richFindings, asked);
    expect(q?.key).toBe("lead_flow_lost");
    expect(q?.key).not.toBe(CLOSING_QUESTION_KEY);
  });
});

// ניקוז שאלות החובה (תיקון באג הדילוג): קרדיט סקציה עולה ל-1 כבר מהתשובה הראשונה (merge.ts),
// ולכן ארבע שאלות ההמשך של lead_flow - ובהן שלוש שאלות הכמות שהדוח בנוי עליהן - לא נשאלו
// לעולם בייצור. הניקוז רץ אחרי מיצוי הלולאה הרחבה ולפני שאלת הסיכום, ולפי חברות ב-askedKeys
describe("pickNextQuestion - ניקוז שאלות החובה", () => {
  // מודל שבו כל הסקציות זוכו - בדיוק מה שקורה אחרי סיבוב אחד של שאלה לכל סקציה
  function allCredited(): BusinessModel {
    const model = deriveBusinessModel(richFindings);
    for (const k of Object.keys(model.credits)) model.credits[k as keyof typeof model.credits] = 1;
    return model;
  }

  it("כל הסקציות זוכו - הצעד הבא הוא שאלת כמות, לא קפיצה לשאלת הסיכום", () => {
    const q = pickNextQuestion(allCredited(), richFindings, ["lead_flow_intake", "service_repeat"]);
    expect(q?.key).toBe("lead_flow_volume");
  });

  it("סדר שאלות הכסף הוא סדר הבנק: כמות, זמן תגובה, שווי - שלושתן ברצף אחרי הפתיחה", () => {
    const model = allCredited();
    const asked = ["lead_flow_intake"];
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const q = pickNextQuestion(model, richFindings, asked);
      expect(q, `צעד ${i} החזיר null באמצע שאלות הכסף`).not.toBeNull();
      seen.push(q!.key);
      asked.push(q!.key);
    }
    expect(seen).toEqual([
      "lead_flow_volume", "lead_flow_response_time", "lead_flow_deal_value",
    ]);
    // ורק אחריהן חוזר סבב הרוחב - שורת ההפסד כבר מלאה בנקודה הזו
    expect(pickNextQuestion(model, richFindings, asked)?.section).toBe("service");
  });

  it("שאלת חובה שנשאלה כבר לא חוזרת - גם כשהתשובה עליה לא חילצה כלום למודל", () => {
    // המודל כאן לא מכיל אף שדה מהשאלות האלה (חילוץ שנכשל/תשובת "אחר"), ובכל זאת הן לא חוזרות:
    // התנאי הוא חברות ב-askedKeys בלבד, כך שכשל חילוץ לא לוכד את בעל העסק בלולאה על אותה שאלה
    const q = pickNextQuestion(allCredited(), richFindings, [...REQUIRED_QUESTION_KEYS]);
    expect(REQUIRED_QUESTION_KEYS).not.toContain(q?.key);
  });

  it("REQUIRED_QUESTION_KEYS: כל המפתחות קיימים בבנק, ובאותו סדר שבו הם מופיעים בו", () => {
    expect(REGULAR_KEYS.filter((k) => REQUIRED_QUESTION_KEYS.includes(k))).toEqual([...REQUIRED_QUESTION_KEYS]);
  });
});

// סשן ראיון שלם מקצה לקצה, דרך אותו צירוף שהשרת מריץ בפועל (run-interview.ts):
// pickNextQuestion -> staticUpdateFor -> applyInterviewUpdates. זו הרגרסיה שכל הבדיקות הקודמות
// פספסו - הן בדקו מבנה בנק וצעד בודד, ולכן הדילוג על שאלות הכמות (קרדיט סקציה שעולה ל-1
// מהתשובה הראשונה) עבר מתחת לרדאר עד שהתגלה בייצור
describe("סשן ראיון שלם", () => {
  // credit=false מדמה ראיון שבו אף תשובה לא זיכתה סקציה (חילוץ שנכשל שוב ושוב)
  function simulateSession(credit = true) {
    let model: BusinessModel = deriveBusinessModel(richFindings);
    const asked: string[] = [];
    let terminated = false;
    // תקרת בטיחות של הבדיקה עצמה: איטרציה אחת מעבר לתקרת המוצר. אם pickNextQuestion לא החזיר
    // null עד אז - יש לולאה אינסופית, וזה ייפול על terminated למטה
    for (let i = 0; i <= MAX_GUIDED_QUESTIONS; i++) {
      const q = pickNextQuestion(model, richFindings, asked);
      if (q == null) { terminated = true; break; }
      const answer = q.options?.[0]?.label ?? "אין לי מה להוסיף"; // שאלת הסיכום היא טקסט חופשי
      const update = credit ? staticUpdateFor(q, answer) : null;
      model = applyInterviewUpdates(model, update ? [update] : [], "interview");
      asked.push(q.key);
    }
    return { asked, model, terminated };
  }

  it("שלוש שאלות הכמות באמת נשאלות - הנתונים ששורת ההפסד האישית בנויה עליהם", () => {
    const { asked } = simulateSession();
    for (const key of REQUIRED_QUESTION_KEYS) {
      expect(asked, `${key} לא נשאלה בסשן מלא`).toContain(key);
    }
  });

  it("סדר הסשן: פתיחה, שלוש שאלות הכסף, ואז סבב רוחב - ובסוף שאלת הסיכום (משימה 7)", () => {
    // ההבדל מהגרסה הקודמת: שאלות הכסף עברו ממקומות 10-12 למקומות 2-4. שורת ההפסד בדוח החי
    // מלאה בשאלה הרביעית במקום השתים-עשרה. הזנב (service_load, billing_tool, lead_flow_lost)
    // הוא הסיבוב השני של סבב הרוחב - שאלות שקודם נמחקו לגמרי בגלל קרדיט הסקציה
    expect(simulateSession().asked).toEqual([
      "lead_flow_intake",
      "lead_flow_volume", "lead_flow_response_time", "lead_flow_deal_value",
      "service_repeat", "billing_flow", "manual_tasks_top", "profile_basics",
      "channels_main", "scheduling_how", "retention_contact", "tools_used",
      "service_load", "billing_tool", "lead_flow_lost",
      CLOSING_QUESTION_KEY,
    ]);
  });

  it("כל הבנק הרגיל נשאל בסשן מלא - אף שאלה לא נמחקת בגלל קרדיט סקציה", () => {
    const { asked } = simulateSession();
    for (const key of REGULAR_KEYS) {
      expect(asked, `${key} לא נשאלה בסשן מלא`).toContain(key);
    }
  });

  it("שורת ההפסד מלאה עד השאלה הרביעית - ההכרעה המוצרית של 24.8", () => {
    const firstFour = simulateSession().asked.slice(0, 4);
    for (const key of REQUIRED_QUESTION_KEYS) {
      expect(firstFour, `${key} לא נשאלה בארבע הראשונות`).toContain(key);
    }
  });

  it("הסשן מסתיים, שאלת הסיכום פעם אחת ואחרונה, בלי כפילויות ובלי חריגה מהתקרה", () => {
    const { asked, terminated } = simulateSession();
    expect(terminated).toBe(true);
    expect(asked.filter((k) => k === CLOSING_QUESTION_KEY)).toHaveLength(1);
    expect(asked[asked.length - 1]).toBe(CLOSING_QUESTION_KEY);
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked.length).toBeLessThanOrEqual(MAX_GUIDED_QUESTIONS);
  });

  it("תשובות הכמות נשמרות במודל כלשונן - בדיוק הערכים ש-loss-calc קורא", () => {
    const leadFlow = simulateSession().model.data.lead_flow;
    expect(leadFlow.weeklyLeads).toBe("עד 10");
    expect(leadFlow.responseTime).toBe("תוך דקות");
    expect(leadFlow.avgDealValue).toBe("עד 300 שקל");
  });

  it("סשן שבו שום תשובה לא זיכתה סקציה - כל הבנק נשאל, עדיין מסתיים בתקרה ובשאלת הסיכום", () => {
    const { asked, terminated } = simulateSession(false);
    expect(terminated).toBe(true);
    expect(asked).toHaveLength(MAX_GUIDED_QUESTIONS);
    expect(asked.slice(0, -1).sort()).toEqual([...REGULAR_KEYS].sort());
    expect(asked[asked.length - 1]).toBe(CLOSING_QUESTION_KEY);
  });
});

describe("interviewPlan - הרשימה הממוספרת במסך הראיון", () => {
  const baseModel = deriveBusinessModel(richFindings);
  const keysOf = (asked: string[]) => interviewPlan(baseModel, richFindings, asked).map((p) => p.question.key);

  it("מכסה את כל הבנק בדיוק פעם אחת כשעוד לא נשאל כלום", () => {
    const keys = keysOf([]);
    expect(keys).toHaveLength(MAX_GUIDED_QUESTIONS);
    expect([...keys].sort()).toEqual(QUESTION_BANK.map((q) => q.key).sort());
  });

  // הבדיקה שמונעת את הדריפט. התוכנית מדמה את pickNextQuestion עצמה, ואם מישהו יחליף אותה
  // אי פעם בהעתק של הכללים - הסדר שהמשתמש רואה ברשימה יפסיק להיות הסדר שבו הוא באמת יישאל,
  // כלומר הרשימה תמספר שקר
  it("הסדר זהה לסדר שבו השאלות באמת נשאלות בסשן מלא", () => {
    const realized: string[] = [];
    let model: BusinessModel = deriveBusinessModel(richFindings);
    for (let i = 0; i <= MAX_GUIDED_QUESTIONS; i++) {
      const q = pickNextQuestion(model, richFindings, realized);
      if (q == null) break;
      const update = staticUpdateFor(q, q.options?.[0]?.label ?? "אין לי מה להוסיף");
      model = applyInterviewUpdates(model, update ? [update] : [], "interview");
      realized.push(q.key);
    }
    expect(keysOf([])).toEqual(realized);
  });

  it("מה שנענה מופיע ראשון, בסדר שבו נענה, ומסומן answered", () => {
    const asked = ["lead_flow_deal_value", "lead_flow_intake"];
    const plan = interviewPlan(baseModel, richFindings, asked);
    expect(plan.slice(0, 2).map((p) => p.question.key)).toEqual(asked);
    expect(plan.slice(0, 2).every((p) => p.answered)).toBe(true);
    expect(plan.slice(2).some((p) => p.answered)).toBe(false);
  });

  // מפתח זר לא אמור להגיע לכאן בפועל (runInterviewTurn דוחה questionKey שאינו בבנק), אבל
  // אם הגיע - הרשימה מציגה רק שאלות אמיתיות. הערה: מפתח כזה כן מנפח את askedKeys.length
  // ולכן מרעיב שאלה אחת בסוף הסבב, וזו התנהגות של pickNextQuestion עצמה ולא של הרשימה
  it("מפתח שאינו בבנק לא מייצר שורה ברשימה", () => {
    const keys = keysOf(["not_a_real_key"]);
    const bank = new Set(QUESTION_BANK.map((q) => q.key));
    expect(keys).not.toContain("not_a_real_key");
    expect(keys.every((k) => bank.has(k))).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("אחרי שאלת הסיכום אין המשך - הרשימה היא בדיוק מה שכבר נשאל", () => {
    const all = keysOf([]);
    expect(keysOf(all)).toEqual(all);
  });

  it("לכל שאלה תווית קצרה וייחודית - שורה ריקה או כפולה ברשימה היא באג", () => {
    const labels = QUESTION_BANK.map((q) => q.label);
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(MAX_GUIDED_QUESTIONS);
    // התווית היא הנושא ולא השאלה עצמה - היא חייבת להיכנס לעמודה של 232 פיקסלים
    expect(labels.filter((l) => l.length > 24)).toEqual([]);
  });
});

describe("answerLabels - סימון התשובה הקודמת בחזרה לשאלה שנענתה", () => {
  const intake = QUESTION_BANK.find((q) => q.key === "lead_flow_intake")!;
  const options = intake.options!.map((o) => o.label);

  it("מחזיר את התוויות שנבחרו בבחירה מרובה", () => {
    expect(answerLabels(options, options[0] + ", " + options[1], true)).toEqual([options[0], options[1]]);
  });

  it("בחירה בודדת: תווית אחת מוחזרת כמו שהיא", () => {
    expect(answerLabels(options, options[2], false)).toEqual([options[2]]);
  });

  // הרגרסיה שקל להחמיץ: תשובת "אחר" היא טקסט חופשי שאינו אף אפשרות. סימון מדומה היה אומר
  // למשתמש שהוא בחר משהו שהוא לא בחר
  it("תשובת אחר (טקסט חופשי) לא מייצרת סימון מדומה", () => {
    expect(answerLabels(options, "בעיקר דרך המלצות של שכנים", true)).toEqual([]);
    expect(answerLabels(options, "", true)).toEqual([]);
  });
});
