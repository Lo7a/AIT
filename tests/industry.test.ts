import { describe, it, expect } from "vitest";
import {
  INDUSTRIES, INDUSTRY_LABEL_HE, INDUSTRY_MODEL_FIELD,
  industryFromPlaces, industryFromAnswer, industryOf,
} from "../src/pipeline/industry";
import type { ScanFindings } from "../src/pipeline/types";
import type { BusinessModel, ModelSection } from "../src/pipeline/model/business-model";
import { MODEL_SECTIONS } from "../src/pipeline/model/business-model";

const META = { startedAt: "", durationMs: 0, placesCalls: 0, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 };

const findings = (business: Partial<ScanFindings["business"]> = {}): ScanFindings => ({
  business: { placeId: "p1", name: "עסק", ...business },
  partial: [],
  meta: META,
});

// מודל מינימלי עם תשובת ראיון אחת - בלי DB ובלי LLM, כמו כל הבדיקות כאן
const modelWith = (answer: unknown): BusinessModel => {
  const empty = Object.fromEntries(MODEL_SECTIONS.map((s) => [s, {}])) as Record<ModelSection, Record<string, unknown>>;
  const credits = Object.fromEntries(MODEL_SECTIONS.map((s) => [s, 0])) as Record<ModelSection, number>;
  return {
    data: { ...empty, profile: { [INDUSTRY_MODEL_FIELD]: answer } },
    fieldSources: {},
    credits,
    completenessPct: 0,
  };
};

describe("industryFromPlaces", () => {
  it("primaryType ספציפי נותן ביטחון גבוה", () => {
    expect(industryFromPlaces("barber_shop")).toEqual({ slug: "beauty_grooming", confidence: "high", source: "places_primary" });
    expect(industryFromPlaces("car_repair")).toEqual({ slug: "auto_service", confidence: "high", source: "places_primary" });
  });

  // ההפרדה שהיא כל העניין: לשניהם יש אוכל, אבל רק לאחד יש שולחנות ולכן תורים
  it("מפריד אוכל בישיבה מאוכל מהיר", () => {
    expect(industryFromPlaces("restaurant").slug).toBe("food_dine_in");
    expect(industryFromPlaces("cafe").slug).toBe("food_dine_in");
    expect(industryFromPlaces("falafel_restaurant").slug).toBe("food_takeaway");
    expect(industryFromPlaces("bakery").slug).toBe("food_takeaway");
    expect(industryFromPlaces("pizza_delivery").slug).toBe("food_takeaway");
  });

  it("נופל ל-types כש-primaryType גנרי או חסר, בביטחון בינוני", () => {
    const r = industryFromPlaces("point_of_interest", ["establishment", "plumber", "store"]);
    expect(r).toEqual({ slug: "trades_onsite", confidence: "medium", source: "places_types" });
    expect(industryFromPlaces(undefined, ["dentist"]).slug).toBe("health_clinic");
  });

  it("לוקח את ההתאמה הראשונה ב-types - גוגל מסדרת מהספציפי לגנרי", () => {
    expect(industryFromPlaces(undefined, ["nail_salon", "spa", "store"]).slug).toBe("beauty_grooming");
  });

  // אין ניחוש ואין ברירת מחדל: סוג גנרי נשאר לא מזוהה, וזה מה שמונע המלצה ענפית שגויה
  it("סוגים גנריים בלבד נשארים unknown", () => {
    expect(industryFromPlaces("establishment", ["point_of_interest", "store", "food"])).toEqual({
      slug: "unknown", confidence: "none", source: "none",
    });
    expect(industryFromPlaces(undefined, undefined).slug).toBe("unknown");
    expect(industryFromPlaces("no_such_type_exists").slug).toBe("unknown");
  });
});

describe("industryFromAnswer", () => {
  it("תווית מהבנק נתפסת מדויק - זה המסלול הרגיל (תשובת צ'יפים נשמרת verbatim)", () => {
    for (const slug of INDUSTRIES) {
      expect(industryFromAnswer(INDUSTRY_LABEL_HE[slug]), slug).toEqual({
        slug, confidence: "high", source: "interview",
      });
    }
  });

  it("טקסט חופשי נתפס לפי מילות מפתח - המסלול של 'אחר, אכתוב בעצמי'", () => {
    expect(industryFromAnswer("יש לי מוסך בחיפה").slug).toBe("auto_service");
    expect(industryFromAnswer("אני שרברב עצמאי").slug).toBe("trades_onsite");
    expect(industryFromAnswer("קליניקה לרפואת שיניים").slug).toBe("health_clinic");
  });

  it("תשובה ריקה, לא מחרוזת, או שלא מזוהה נשארת unknown", () => {
    for (const bad of ["", "   ", null, undefined, 42, {}, "משהו כללי לגמרי"]) {
      expect(industryFromAnswer(bad).slug, String(bad)).toBe("unknown");
    }
  });
});

describe("industryOf - הראיון גובר על הסריקה (הכרעת מייסד 6.5)", () => {
  it("תשובת הראיון דורסת את גוגל, גם כשגוגל בטוחה", () => {
    const f = findings({ primaryType: "restaurant" });
    expect(industryOf(f, null).slug).toBe("food_dine_in");
    expect(industryOf(f, modelWith(INDUSTRY_LABEL_HE.food_takeaway)).slug).toBe("food_takeaway");
  });

  it("תשובת ראיון שלא זוהתה לא מוחקת את מה שגוגל כן ידעה", () => {
    const f = findings({ primaryType: "barber_shop" });
    expect(industryOf(f, modelWith("בלה בלה")).slug).toBe("beauty_grooming");
  });

  it("בלי מודל ובלי סוגים מגוגל - unknown, בלי ניחוש", () => {
    expect(industryOf(findings(), null).slug).toBe("unknown");
  });
});

describe("שלמות הטבלאות", () => {
  it("לכל ענף יש תווית עברית, וכל תווית ייחודית", () => {
    const labels = INDUSTRIES.map((s) => INDUSTRY_LABEL_HE[s]);
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(INDUSTRIES.length);
  });

  // אף ענף אינו "מת": לכל אחד יש לפחות סוג Places אמיתי שמגיע אליו. בלי הבדיקה הזו אפשר
  // להגדיר ענף, לזרוע לו פריטי קטלוג, ולגלות רק בשטח שאין דרך להגיע אליו מהסריקה
  it("כל ענף ניתן להגעה מסוג Places אמיתי", () => {
    const representative: Record<string, string> = {
      food_dine_in: "restaurant", food_takeaway: "bakery", beauty_grooming: "hair_salon",
      health_clinic: "dentist", fitness_studio: "gym", auto_service: "car_repair",
      trades_onsite: "electrician", retail_store: "clothing_store",
      professional_services: "lawyer", education_training: "driving_school",
    };
    for (const slug of INDUSTRIES) {
      expect(industryFromPlaces(representative[slug]).slug, slug).toBe(slug);
    }
  });
});
