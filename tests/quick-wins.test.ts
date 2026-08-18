import { describe, expect, it } from "vitest";
import { MAX_QUICK_WINS, quickWins } from "../src/pipeline/roadmap/quick-wins";
import type { DimensionKey, DimensionScore, RuleResult, ScoreReport } from "../src/pipeline/score/types";

// "מה אפשר לעשות כבר עכשיו" (צעדים חינמיים): quickWins הוא מודול טהור מעל תוצאות החוקים
// השמורות - (scores) -> צעדים, בלי I/O ובלי LLM. הבדיקה החשובה כאן היא הכנות: חוק שלא נבדק
// (known=false, "לא נבדק" במסך) לעולם לא מייצר צעד, כי אז היינו מציעים לתקן משהו שאולי קיים
// ופשוט לא ראינו אותו (אתר SPA שהטופס שלו מרונדר בדפדפן).

type RuleState = "gap" | "ok" | "unknown";

// המפתחות שהחוקים קוראים, והממד שכל אחד חי בו בפועל ב-dimensions.ts
const DIMENSION_OF_KEY: Record<string, DimensionKey> = {
  gbp_exists: "visibility",
  gbp_phone: "visibility",
  contact_form: "accessibility",
  phone_available: "accessibility",
  whatsapp: "accessibility",
  a11y_statement: "accessibility",
  has_reviews: "reputation",
  analytics: "infrastructure",
};

const ALL_GAP_KEYS = Object.keys(DIMENSION_OF_KEY);

function ruleResult(key: string, state: RuleState): RuleResult {
  const known = state !== "unknown";
  const earned = state === "ok";
  return { key, points: 10, known, earned, text: known ? `טקסט ${key}` : "" };
}

// מפתח שלא מופיע ברשומה כלל = לא קיים בדוח בכלל (שורת סריקה ישנה) - לא "פער"
function scoreReport(states: Record<string, RuleState>): ScoreReport {
  const byDimension = new Map<DimensionKey, RuleResult[]>();
  for (const [key, state] of Object.entries(states)) {
    const dimension = DIMENSION_OF_KEY[key] ?? "visibility";
    const rules = byDimension.get(dimension) ?? [];
    rules.push(ruleResult(key, state));
    byDimension.set(dimension, rules);
  }
  const dimensions: DimensionScore[] = [...byDimension.entries()].map(([key, rules]) => ({
    key, label: key, weight: 0.2, score: 50, dataStatus: "full", rules,
  }));
  return { overall: 50, dimensions, topGaps: [], topStrengths: [] };
}

const allStates = (state: RuleState): Record<string, RuleState> =>
  Object.fromEntries(ALL_GAP_KEYS.map((key) => [key, state]));

const keysOf = (scores: ScoreReport, limit?: number) => quickWins(scores, limit).map((w) => w.key);

describe("quickWins - שערי כניסה", () => {
  it("scores=null (אבחון בלי ציונים שמורים) -> מערך ריק", () => {
    expect(quickWins(null)).toEqual([]);
  });

  it("דוח בלי ממדים כלל -> מערך ריק", () => {
    expect(quickWins({ overall: null, dimensions: [], topGaps: [], topStrengths: [] })).toEqual([]);
  });

  it("עסק שהכול אצלו תקין (כל החוקים earned) -> מערך ריק, המסך לא מציג כלום", () => {
    expect(quickWins(scoreReport(allStates("ok")))).toEqual([]);
  });
});

describe("quickWins - כנות: 'לא נבדק' לעולם לא הופך לצעד", () => {
  it("כל החוקים known=false -> מערך ריק (לא מציעים לתקן מה שלא ראינו)", () => {
    expect(quickWins(scoreReport(allStates("unknown")))).toEqual([]);
  });

  // כל חוק בנפרד: השורה היחידה שמשתנה היא known, והצעד חייב להיעלם
  for (const key of ALL_GAP_KEYS) {
    it(`${key}: פער אמיתי מייצר צעד, אותו חוק ב"לא נבדק" לא מייצר כלום`, () => {
      const gapStates = { ...allStates("ok"), [key]: "gap" as RuleState };
      const unknownStates = { ...allStates("ok"), [key]: "unknown" as RuleState };
      const withGap = quickWins(scoreReport(gapStates));
      const withUnknown = quickWins(scoreReport(unknownStates));
      expect(withUnknown).toEqual([]);
      if (key === "contact_form" || key === "phone_available") {
        // הצעד הזה מותנה בשני החוקים יחד - ראו הבדיקה הייעודית למטה
        expect(withGap).toEqual([]);
      } else {
        expect(withGap).toHaveLength(1);
      }
    });
  }

  it("חוק שלא קיים בדוח בכלל (שורת סריקה ישנה) נחשב לא נבדק - אין צעד", () => {
    expect(quickWins(scoreReport({ analytics: "gap" }))).toHaveLength(1);
    expect(quickWins(scoreReport({}))).toEqual([]);
  });
});

describe("quickWins - חוקים בודדים", () => {
  it("gbp_exists בפער -> פתיחת פרופיל עסק בגוגל", () => {
    const wins = quickWins(scoreReport({ gbp_exists: "gap" }));
    expect(wins).toEqual([{
      key: "gbp_create",
      title: "לפתוח פרופיל עסק בגוגל",
      why: "פרופיל פעיל מציב את העסק בתוצאות ובמפות מול לקוחות שמחפשים בסביבה",
      how: "נכנסים ל-Google Business Profile, פותחים כרטיס עם שם העסק, כתובת, טלפון ותחום עיסוק, ומתחילים את אימות הבעלות",
    }]);
  });

  it("gbp_phone בפער -> השלמת טלפון בפרופיל", () => {
    expect(keysOf(scoreReport({ gbp_phone: "gap" }))).toEqual(["gbp_phone"]);
  });

  it("whatsapp בפער -> כפתור וואטסאפ", () => {
    expect(keysOf(scoreReport({ whatsapp: "gap" }))).toEqual(["whatsapp_link"]);
  });

  it("has_reviews בפער -> בקשת ביקורות", () => {
    expect(keysOf(scoreReport({ has_reviews: "gap" }))).toEqual(["ask_reviews"]);
  });

  it("a11y_statement בפער -> הצהרת נגישות", () => {
    expect(keysOf(scoreReport({ a11y_statement: "gap" }))).toEqual(["a11y_statement"]);
  });

  it("analytics בפער -> חיבור מדידה", () => {
    expect(keysOf(scoreReport({ analytics: "gap" }))).toEqual(["analytics_basic"]);
  });
});

describe("quickWins - 'אין דרך ליצירת קשר' דורש את שני החוקים", () => {
  it("אין טופס וגם אין טלפון נגיש -> צעד אחד", () => {
    const wins = quickWins(scoreReport({ contact_form: "gap", phone_available: "gap" }));
    expect(wins.map((w) => w.key)).toEqual(["contact_way"]);
    expect(wins[0].title).toBe("לשים דרך אחת ברורה ליצירת קשר באתר");
  });

  it("אין טופס אבל יש טלפון נגיש -> אין צעד (יש דרך ליצור קשר)", () => {
    expect(quickWins(scoreReport({ contact_form: "gap", phone_available: "ok" }))).toEqual([]);
  });

  it("יש טופס ואין טלפון -> אין צעד", () => {
    expect(quickWins(scoreReport({ contact_form: "ok", phone_available: "gap" }))).toEqual([]);
  });

  it("אין טופס וגם הטלפון לא נבדק -> אין צעד (חצי ידיעה זו לא ידיעה)", () => {
    expect(quickWins(scoreReport({ contact_form: "gap", phone_available: "unknown" }))).toEqual([]);
  });
});

describe("quickWins - תקרה וסדר", () => {
  it(`תקרת ברירת המחדל היא ${MAX_QUICK_WINS} גם כשכל החוקים בפער`, () => {
    const wins = quickWins(scoreReport(allStates("gap")));
    expect(wins).toHaveLength(MAX_QUICK_WINS);
    expect(wins.map((w) => w.key)).toEqual(["gbp_create", "gbp_phone", "contact_way", "whatsapp_link"]);
  });

  it("סדר העדיפות קבוע - הצעדים שנשארו נכנסים באותו סדר יחסי גם בלי הקודמים", () => {
    const withoutGbp = scoreReport({ ...allStates("gap"), gbp_exists: "ok", gbp_phone: "ok" });
    expect(keysOf(withoutGbp)).toEqual(["contact_way", "whatsapp_link", "ask_reviews", "a11y_statement"]);
  });

  it("limit מותאם מכובד, ו-limit=0 מחזיר מערך ריק", () => {
    const scores = scoreReport(allStates("gap"));
    expect(keysOf(scores, 2)).toEqual(["gbp_create", "gbp_phone"]);
    expect(quickWins(scores, 0)).toEqual([]);
  });

  it("limit גדול ממספר החוקים - מחזיר את כולם בלי לזרוק", () => {
    // contact_way מאחד שני מפתחות, ולכן מספר הצעדים קטן במפתח אחד ממספר החוקים
    expect(quickWins(scoreReport(allStates("gap")), 50)).toHaveLength(ALL_GAP_KEYS.length - 1);
  });

  it("דטרמיניסטי: אותו קלט מחזיר בדיוק אותו פלט בכל קריאה", () => {
    const scores = scoreReport({ whatsapp: "gap", analytics: "gap", has_reviews: "gap" });
    expect(quickWins(scores)).toEqual(quickWins(scores));
  });
});

describe("quickWins - כללי הטקסט", () => {
  const allWins = quickWins(scoreReport(allStates("gap")), 50);

  it("אין תווים אסורים בטקסטים (מקף ארוך, שלוש נקודות כתו יחיד, תווי כיווניות)", () => {
    // התווים נכתבים כ-escapes בכוונה: תו כיווניות אמיתי בקוד הוא בדיוק מה שאסור כאן
    const forbidden = /[\u2013\u2014\u2026\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
    for (const win of allWins) {
      expect(forbidden.test(`${win.title} ${win.why} ${win.how}`), win.key).toBe(false);
    }
  });

  it("אין ספרות בטקסט הצעדים - הם הוראות קבועות, לא נתונים על העסק", () => {
    for (const win of allWins) {
      expect(/\p{N}/u.test(`${win.title} ${win.why} ${win.how}`), win.key).toBe(false);
    }
  });

  it("לכל צעד יש מפתח ייחודי ושלושה שדות טקסט לא ריקים", () => {
    expect(new Set(allWins.map((w) => w.key)).size).toBe(allWins.length);
    for (const win of allWins) {
      expect(win.title.length, win.key).toBeGreaterThan(0);
      expect(win.why.length, win.key).toBeGreaterThan(0);
      expect(win.how.length, win.key).toBeGreaterThan(0);
    }
  });
});
