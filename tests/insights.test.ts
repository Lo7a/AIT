import { describe, expect, it } from "vitest";
import { MAX_INSIGHTS, insights, type Insight } from "../src/pipeline/roadmap/insights";
import type { DimensionKey, DimensionScore, RuleResult, ScoreReport } from "../src/pipeline/score/types";

// "מה הבנתי על העסק שלך": insights הוא מודול טהור מעל תוצאות החוקים השמורות -
// (scores) -> מסקנות, בלי I/O ובלי LLM. כל מסקנה מחברת שני אותות מאומתים או יותר.
//
// הבדיקה החשובה כאן היא הכנות: אות שלא נבדק (known=false, "לא נבדק" במסך) לעולם לא מצטרף
// למסקנה - לא כשלילה ולא כחיוב. מסקנה שחסר לה אפילו אות אחד פשוט לא נוצרת, כי מסקנה שנשענת
// על חצי ידיעה היא בדיוק הסוג של הרושם שאסור לנו למכור.

type RuleState = "gap" | "ok" | "unknown";

// המפתחות שהחוקים כאן קוראים, והממד שכל אחד חי בו בפועל ב-dimensions.ts
const DIMENSION_OF_KEY: Record<string, DimensionKey> = {
  gbp_exists: "visibility",
  has_website: "visibility",
  perf: "visibility",
  lcp: "visibility",
  has_reviews: "reputation",
  review_volume: "reputation",
  rating_good: "reputation",
  phone_available: "accessibility",
  contact_form: "accessibility",
  whatsapp: "accessibility",
  online_booking: "accessibility",
  a11y_statement: "accessibility",
  site_a11y: "accessibility",
  analytics: "infrastructure",
  fb_pixel: "infrastructure",
  chat_widget: "infrastructure",
  multi_page: "infrastructure",
  lead_handling: "process",
};

const ALL_KEYS = Object.keys(DIMENSION_OF_KEY);

function ruleResult(key: string, state: RuleState): RuleResult {
  const known = state !== "unknown";
  const earned = state === "ok";
  return { key, points: 10, known, earned, text: known ? `טקסט ${key}` : "" };
}

// מפתח שלא מופיע ברשומה כלל = לא קיים בדוח בכלל (שורת סריקה ישנה) - לא פער ולא הישג
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
  Object.fromEntries(ALL_KEYS.map((key) => [key, state]));

// בסיס "הכול תקין", ומעליו רק הפערים שהמסקנה הנבדקת דורשת - כך כל תרחיש מפעיל מסקנה אחת בדיוק
const withGaps = (...gapKeys: string[]): Record<string, RuleState> => ({
  ...allStates("ok"),
  ...Object.fromEntries(gapKeys.map((key) => [key, "gap" as RuleState])),
});

const keysOf = (states: Record<string, RuleState>, limit?: number) =>
  insights(scoreReport(states), limit).map((i) => i.key);

// התרחיש שמפעיל כל מסקנה, והמפתחות שהיא באמת נשענת עליהם (חיובי או שלילי) - שתי הרשימות
// יחד הן החוזה שנבדק למטה גם לפעולה וגם לכנות
interface Scenario {
  key: string;
  states: Record<string, RuleState>;
  requiredKeys: string[];
}

const SCENARIOS: Scenario[] = [
  {
    key: "single_door",
    states: withGaps("contact_form", "whatsapp", "online_booking", "chat_widget"),
    requiredKeys: ["phone_available", "contact_form", "whatsapp", "online_booking", "chat_widget"],
  },
  {
    key: "measuring_no_destination",
    // whatsapp תקין - ולכן מסקנת הדלת האחת לא נכנסת ולא משתיקה את זו
    states: withGaps("contact_form", "online_booking", "chat_widget"),
    requiredKeys: ["analytics", "contact_form", "online_booking", "chat_widget"],
  },
  {
    key: "profile_carries_business",
    states: withGaps("multi_page"),
    requiredKeys: ["gbp_exists", "rating_good", "has_reviews", "multi_page"],
  },
  {
    key: "mobile_first_impression",
    // rating_good בפער -> מסקנת הפרופיל לא נכנסת (הפרופיל לא "מתפקד") ולא משתיקה את זו
    states: withGaps("perf", "rating_good"),
    requiredKeys: ["gbp_exists", "has_website", "perf"],
  },
  {
    key: "happy_but_invisible",
    states: withGaps("review_volume"),
    requiredKeys: ["rating_good", "has_reviews", "review_volume"],
  },
  {
    key: "working_blind",
    states: withGaps("analytics", "fb_pixel"),
    requiredKeys: ["has_website", "multi_page", "analytics", "fb_pixel"],
  },
  {
    key: "accessibility_exposure",
    states: withGaps("a11y_statement", "site_a11y"),
    requiredKeys: ["has_website", "a11y_statement", "site_a11y"],
  },
];

describe("insights - שערי כניסה", () => {
  it("scores=null (אבחון בלי ציונים שמורים) -> מערך ריק", () => {
    expect(insights(null)).toEqual([]);
  });

  it("דוח בלי ממדים כלל -> מערך ריק", () => {
    expect(insights({ overall: null, dimensions: [], topGaps: [], topStrengths: [] })).toEqual([]);
  });

  it("עסק שהכול אצלו תקין -> מערך ריק, הסקציה לא מוצגת בכלל", () => {
    expect(insights(scoreReport(allStates("ok")))).toEqual([]);
  });

  it("דוח שכולו פערים אמיתיים בלי אף הישג -> מערך ריק (לכל מסקנה דרוש גם צד חיובי)", () => {
    expect(insights(scoreReport(allStates("gap")))).toEqual([]);
  });
});

describe("insights - כנות: אות שלא נבדק לא מצטרף לשום מסקנה", () => {
  it("כל החוקים known=false -> מערך ריק", () => {
    expect(insights(scoreReport(allStates("unknown")))).toEqual([]);
  });

  // הבדיקה המרכזית: לכל מסקנה, כל אחד מהאותות שהיא נשענת עליהם מוחלף ב"לא נבדק" בנפרד -
  // והמסקנה חייבת להיעלם. אין חצי מסקנה
  for (const scenario of SCENARIOS) {
    it(`${scenario.key}: נוצרת בשילוב המלא, ונעלמת כשכל אחד מהאותות שלה לא נבדק`, () => {
      expect(keysOf(scenario.states)).toContain(scenario.key);
      for (const key of scenario.requiredKeys) {
        const blinded = { ...scenario.states, [key]: "unknown" as RuleState };
        expect(keysOf(blinded), `${scenario.key} בלי ${key}`).not.toContain(scenario.key);
      }
    });
  }

  it("חוק שחסר לגמרי מהדוח (שורת סריקה ישנה) נחשב לא נבדק", () => {
    for (const scenario of SCENARIOS) {
      for (const key of scenario.requiredKeys) {
        const missing = { ...scenario.states };
        delete missing[key];
        expect(keysOf(missing), `${scenario.key} בלי השורה ${key}`).not.toContain(scenario.key);
      }
    }
  });
});

describe("insights - כל מסקנה נוצרת בדיוק בשילוב שלה", () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.key}: התרחיש שלה מייצר אותה ואת כלום מעבר`, () => {
      expect(keysOf(scenario.states, 50)).toEqual([scenario.key]);
    });
  }

  it("הדלת האחת דורשת שכל ארבעת הערוצים ייבדקו ויימצאו חסרים, וגם טלפון קיים", () => {
    expect(keysOf(withGaps("contact_form", "whatsapp", "online_booking"))).not.toContain("single_door");
    const noPhone = { ...withGaps("contact_form", "whatsapp", "online_booking", "chat_widget"), phone_available: "gap" as RuleState };
    expect(keysOf(noPhone)).not.toContain("single_door");
  });

  it("מסקנת הפרופיל דורשת לפחות פער אחד באתר, ומצרפת שורת ראיה לכל פער שנמצא", () => {
    expect(keysOf(withGaps())).toEqual([]); // פרופיל מתפקד ואתר תקין - אין מה לומר
    const both = insights(scoreReport(withGaps("perf", "lcp")));
    const profile = both.find((i) => i.key === "profile_carries_business") as Insight;
    expect(profile.evidence).toHaveLength(3); // ראיית הפרופיל + שתי ראיות האתר
  });

  it("שורת הראיון מתווספת רק כשהיא פער אמיתי, ואינה תנאי כניסה", () => {
    const base = withGaps("contact_form", "whatsapp", "online_booking", "chat_widget");
    const withoutInterview = insights(scoreReport({ ...base, lead_handling: "unknown" }))[0];
    const withInterview = insights(scoreReport({ ...base, lead_handling: "gap" }))[0];
    expect(withoutInterview.key).toBe("single_door");
    expect(withInterview.key).toBe("single_door");
    expect(withInterview.evidence).toHaveLength(withoutInterview.evidence.length + 1);
    expect(withInterview.evidence.at(-1)).toContain("בראיון");
  });
});

describe("insights - השתקה בין מסקנות שנשענות על אותם ממצאים", () => {
  it("כשנאמרה מסקנת הדלת האחת, מסקנת המדידה בלי יעד לא חוזרת על אותם ממצאים", () => {
    const keys = keysOf(withGaps("contact_form", "whatsapp", "online_booking", "chat_widget"), 50);
    expect(keys).toContain("single_door");
    expect(keys).not.toContain("measuring_no_destination");
  });

  it("כשנאמרה מסקנת הפרופיל, מסקנת הנייד לא חוזרת על אותו ממצא ביצועים", () => {
    const keys = keysOf(withGaps("perf"), 50);
    expect(keys).toContain("profile_carries_business");
    expect(keys).not.toContain("mobile_first_impression");
  });
});

describe("insights - תקרה וסדר", () => {
  // עסק אמיתי שמפעיל יותר ממסקנה אחת: פרופיל חזק, אתר חלש, בלי ערוצים דיגיטליים ובלי מדידה
  const busy = {
    ...allStates("gap"),
    phone_available: "ok" as RuleState,
    gbp_exists: "ok" as RuleState,
    rating_good: "ok" as RuleState,
    has_reviews: "ok" as RuleState,
    has_website: "ok" as RuleState,
    multi_page: "ok" as RuleState,
  };

  it(`התקרה היא ${MAX_INSIGHTS} גם כשיש יותר מסקנות שמתקיימות`, () => {
    expect(insights(scoreReport(busy))).toHaveLength(MAX_INSIGHTS);
    expect(keysOf(busy)).toEqual(["single_door", "profile_carries_business", "happy_but_invisible"]);
  });

  it("סדר העדיפות קבוע - מה שנשאר נכנס באותו סדר יחסי גם בלי הקודמים", () => {
    expect(keysOf(busy, 50)).toEqual([
      "single_door", "profile_carries_business", "happy_but_invisible", "working_blind", "accessibility_exposure",
    ]);
  });

  it("limit מותאם מכובד, ו-limit=0 מחזיר מערך ריק", () => {
    expect(keysOf(busy, 1)).toEqual(["single_door"]);
    expect(insights(scoreReport(busy), 0)).toEqual([]);
  });

  it("דטרמיניסטי: אותו קלט מחזיר בדיוק אותו פלט בכל קריאה", () => {
    const scores = scoreReport(busy);
    expect(insights(scores)).toEqual(insights(scores));
    expect(insights(scores, 50)).toEqual(insights(scores, 50));
  });
});

describe("insights - כללי הטקסט", () => {
  // כל המסקנות שהמודול יודע לייצר, מכל התרחישים יחד
  const allInsights: Insight[] = SCENARIOS.flatMap((s) => insights(scoreReport(s.states), 50));
  const textOf = (i: Insight) => `${i.title} ${i.evidence.join(" ")} ${i.soWhat} ${i.action}`;

  it("כל המסקנות מיוצגות בבדיקות הטקסט", () => {
    expect(allInsights).toHaveLength(SCENARIOS.length);
  });

  it("אין תווים אסורים (מקף ארוך, שלוש נקודות כתו יחיד, תווי כיווניות)", () => {
    // התווים נכתבים כ-escapes בכוונה: תו כיווניות אמיתי בקוד הוא בדיוק מה שאסור כאן
    const forbidden = /[\u2013\u2014\u2026\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
    for (const insight of allInsights) {
      expect(forbidden.test(textOf(insight)), insight.key).toBe(false);
    }
  });

  it("אין ספרות באף מחרוזת - המסקנות הן מסקנות, לא כימות של העסק", () => {
    for (const insight of allInsights) {
      expect(/\p{N}/u.test(textOf(insight)), insight.key).toBe(false);
    }
  });

  it("לכל מסקנה מפתח ייחודי, לפחות שתי שורות ראיה, וכל השדות מלאים", () => {
    expect(new Set(allInsights.map((i) => i.key)).size).toBe(allInsights.length);
    for (const insight of allInsights) {
      expect(insight.title.length, insight.key).toBeGreaterThan(0);
      expect(insight.soWhat.length, insight.key).toBeGreaterThan(0);
      expect(insight.action.length, insight.key).toBeGreaterThan(0);
      expect(insight.evidence.length, insight.key).toBeGreaterThanOrEqual(2);
      for (const line of insight.evidence) expect(line.length, insight.key).toBeGreaterThan(0);
    }
  });
});
