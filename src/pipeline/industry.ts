// זיהוי ענף העסק (מחקר R1, docs/research/2026-08-19-vertical-taxonomy.md; הכרעות מייסד 19.8).
//
// למה בכלל: למנוע ההתאמה יש היום תנאי אחד, gapKeys, ואין שום דרך להגיד "הפריט הזה רק
// למסעדות". התוצאה שנרשמה במחקר המסעדות היא תפריט QR שמומלץ לשרברב. הענף הוא התנאי השני.
//
// שלושה כללים שהמודול הזה בנוי סביבם:
// 1. **דטרמיניסטי וגלוי, לא LLM.** טבלת מיפוי, בדיוק כמו טביעות האצבע ב-signals.ts וטבלת
//    ניתוב הכאב ב-matching.ts. ענף שגוי הוא המלצה שגויה, וניחוש של מודל אינו ניתן לבדיקה.
// 2. **הראיון גובר על הסריקה, תמיד** (הכרעה 6.5). עקבי עם "המילים של בעל העסק מובילות".
// 3. **לא זוהה נשאר לא זוהה.** אין ניחוש ברירת מחדל. עסק ב-unknown רואה רק פריטים כלליים
//    (הכרעה 6.1), וזה בדיוק כלל הברזל: מה שלא נבדק לא הופך לקביעה.
import type { ScanFindings } from "./types";
import type { BusinessModel } from "./model/business-model";
import { compileKeyword, matchesAnyKeyword } from "./hebrew-match";

// עשרה ענפים. החלוקה אינה לפי סיווג כלכלי אלא לפי **מה שונה בתוכנית שאנחנו מציעים** -
// ולכן אוכל בישיבה ואוכל מהיר הם שני ענפים (לאחד יש הזמנת מקומות, לשני אין), ואילו כל
// בעלי המלאכה הם ענף אחד (לכולם אותו סיפור: מענה דחוף, רדיוס שירות, מהירות הצעת מחיר)
export const INDUSTRIES = [
  "food_dine_in", "food_takeaway", "beauty_grooming", "health_clinic", "fitness_studio",
  "auto_service", "trades_onsite", "retail_store", "professional_services", "education_training",
] as const;

export type IndustrySlug = (typeof INDUSTRIES)[number];
export type IndustryValue = IndustrySlug | "unknown";

export interface IndustryResult {
  slug: IndustryValue;
  // high = primaryType ספציפי או תשובת בעלים · medium = נגזר מ-types · none = לא זוהה
  confidence: "high" | "medium" | "none";
  source: "interview" | "places_primary" | "places_types" | "none";
}

export const INDUSTRY_LABEL_HE: Record<IndustrySlug, string> = {
  food_dine_in: "מסעדה, בית קפה או בר",
  food_takeaway: "אוכל מהיר, מאפייה או קונדיטוריה",
  beauty_grooming: "טיפוח ויופי",
  health_clinic: "בריאות וקליניקות",
  fitness_studio: "כושר וסטודיו",
  auto_service: "רכב ומוסכים",
  trades_onsite: "עבודה אצל הלקוח",
  retail_store: "חנות וקמעונאות",
  professional_services: "שירות מקצועי",
  education_training: "חינוך והכשרה",
};

// מיפוי סוגי Google Places לענפים. הרשימות נשלפו מילולית מתיעוד Places (מחקר R1) ולא
// מזיכרון - השליפה הראשונה שם החזירה סוגים שאינם קיימים, וזה נרשם ככלל מחייב לסבבים הבאים.
// סוג שאינו ברשימה כאן פשוט לא ממופה: אין ברירת מחדל, ואין ניחוש. סוגים גנריים של גוגל
// (establishment, point_of_interest, store, food) אינם כאן בכוונה ולכן נופלים ל-unknown
const TYPE_TO_INDUSTRY: Readonly<Record<string, IndustrySlug>> = Object.freeze({
  // --- food_dine_in: יש ישיבה, ולכן יש הזמנת מקומות ---
  restaurant: "food_dine_in", israeli_restaurant: "food_dine_in", middle_eastern_restaurant: "food_dine_in",
  italian_restaurant: "food_dine_in", sushi_restaurant: "food_dine_in", seafood_restaurant: "food_dine_in",
  steak_house: "food_dine_in", fine_dining_restaurant: "food_dine_in", family_restaurant: "food_dine_in",
  vegan_restaurant: "food_dine_in", vegetarian_restaurant: "food_dine_in", cafe: "food_dine_in",
  coffee_shop: "food_dine_in", bar: "food_dine_in", pub: "food_dine_in", wine_bar: "food_dine_in",
  cocktail_bar: "food_dine_in", lounge_bar: "food_dine_in", sports_bar: "food_dine_in",
  gastropub: "food_dine_in", brewpub: "food_dine_in", bistro: "food_dine_in", diner: "food_dine_in",
  tea_house: "food_dine_in", hookah_bar: "food_dine_in",
  // --- food_takeaway: אין ישיבה ואין תורים. הענף שהכי חשוב לא להמליץ לו על מערכת תורים ---
  fast_food_restaurant: "food_takeaway", falafel_restaurant: "food_takeaway", shawarma_restaurant: "food_takeaway",
  kebab_shop: "food_takeaway", hamburger_restaurant: "food_takeaway", pizza_restaurant: "food_takeaway",
  pizza_delivery: "food_takeaway", sandwich_shop: "food_takeaway", bakery: "food_takeaway",
  cake_shop: "food_takeaway", pastry_shop: "food_takeaway", confectionery: "food_takeaway",
  candy_store: "food_takeaway", chocolate_shop: "food_takeaway", ice_cream_shop: "food_takeaway",
  juice_shop: "food_takeaway", donut_shop: "food_takeaway", bagel_shop: "food_takeaway",
  deli: "food_takeaway", meal_takeaway: "food_takeaway", meal_delivery: "food_takeaway",
  food_delivery: "food_takeaway", snack_bar: "food_takeaway", salad_shop: "food_takeaway",
  coffee_stand: "food_takeaway", catering_service: "food_takeaway",
  // --- beauty_grooming: כיסוי האתרים הגרוע ביותר שנמדד בישראל, וענף שכולו תורים ---
  barber_shop: "beauty_grooming", hair_salon: "beauty_grooming", hair_care: "beauty_grooming",
  beauty_salon: "beauty_grooming", beautician: "beauty_grooming", nail_salon: "beauty_grooming",
  makeup_artist: "beauty_grooming", skin_care_clinic: "beauty_grooming", spa: "beauty_grooming",
  massage: "beauty_grooming", massage_spa: "beauty_grooming", sauna: "beauty_grooming",
  tanning_studio: "beauty_grooming", body_art_service: "beauty_grooming", foot_care: "beauty_grooming",
  wellness_center: "beauty_grooming",
  // --- health_clinic ---
  doctor: "health_clinic", dentist: "health_clinic", dental_clinic: "health_clinic",
  medical_clinic: "health_clinic", medical_center: "health_clinic", medical_lab: "health_clinic",
  physiotherapist: "health_clinic", chiropractor: "health_clinic", veterinary_care: "health_clinic",
  pharmacy: "health_clinic", drugstore: "health_clinic",
  // --- fitness_studio: הרשמה לשיעור, לא תור אישי ---
  gym: "fitness_studio", fitness_center: "fitness_studio", yoga_studio: "fitness_studio",
  sports_club: "fitness_studio", sports_coaching: "fitness_studio", sports_school: "fitness_studio",
  swimming_pool: "fitness_studio", sports_activity_location: "fitness_studio", dance_hall: "fitness_studio",
  // --- auto_service ---
  car_repair: "auto_service", car_wash: "auto_service", tire_shop: "auto_service",
  auto_parts_store: "auto_service", car_dealer: "auto_service", car_rental: "auto_service",
  // --- trades_onsite: העבודה אצל הלקוח, ולכן אין "תור" אלא קריאה ---
  plumber: "trades_onsite", electrician: "trades_onsite", locksmith: "trades_onsite",
  painter: "trades_onsite", roofing_contractor: "trades_onsite", moving_company: "trades_onsite",
  storage: "trades_onsite", courier_service: "trades_onsite", shipping_service: "trades_onsite",
  // --- retail_store ---
  clothing_store: "retail_store", womens_clothing_store: "retail_store", shoe_store: "retail_store",
  jewelry_store: "retail_store", book_store: "retail_store", electronics_store: "retail_store",
  cell_phone_store: "retail_store", furniture_store: "retail_store", home_goods_store: "retail_store",
  hardware_store: "retail_store", home_improvement_store: "retail_store", building_materials_store: "retail_store",
  pet_store: "retail_store", toy_store: "retail_store", gift_shop: "retail_store",
  cosmetics_store: "retail_store", sporting_goods_store: "retail_store", sportswear_store: "retail_store",
  bicycle_store: "retail_store", florist: "retail_store", butcher_shop: "retail_store",
  grocery_store: "retail_store", convenience_store: "retail_store", supermarket: "retail_store",
  liquor_store: "retail_store", health_food_store: "retail_store", garden_center: "retail_store",
  tailor: "retail_store",
  // --- professional_services: הנפח הגדול במשק, אבל הפער הדיגיטלי הקטן ביותר ---
  lawyer: "professional_services", accounting: "professional_services", insurance_agency: "professional_services",
  real_estate_agency: "professional_services", consultant: "professional_services",
  architect: "professional_services", graphic_designer: "professional_services",
  travel_agency: "professional_services", marketing_agency: "professional_services",
  // --- education_training ---
  school: "education_training", primary_school: "education_training", secondary_school: "education_training",
  preschool: "education_training", child_care_agency: "education_training", university: "education_training",
  driving_school: "education_training", music_school: "education_training",
});

// תוויות תשובת הראיון -> סלאג. תווית שנבחרה מהבנק נשמרת verbatim (הנתיב הסטטי, בלי LLM)
// ולכן ההתאמה המדויקת היא המסלול הרגיל; מילות המפתח כאן קיימות בשביל "אחר - אכתוב בעצמי".
// **ההתאמה עוברת דרך hebrew-match.ts ולא דרך includes**, וזו לא קפדנות: "שרברב" מכיל את
// המחרוזת "בר", וחיפוש תת-מחרוזת תמים סיווג אינסטלטור כמסעדה (נתפס בבדיקה)
const ANSWER_KEYWORDS: readonly { readonly words: readonly string[]; readonly slug: IndustrySlug }[] = [
  { words: ["מסעדה", "בית קפה", "בר", "פאב", "ביסטרו"], slug: "food_dine_in" },
  { words: ["אוכל מהיר", "מאפייה", "קונדיטוריה", "פלאפל", "שווארמה", "פיצרייה", "פיצריה", "קייטרינג"], slug: "food_takeaway" },
  { words: ["מספרה", "ספר", "קוסמטיקה", "ציפורניים", "יופי", "טיפוח", "ספא", "עיסוי"], slug: "beauty_grooming" },
  { words: ["קליניקה", "רופא", "שיניים", "פיזיותרפיה", "וטרינר", "בית מרקחת", "בריאות"], slug: "health_clinic" },
  { words: ["כושר", "חדר כושר", "סטודיו", "יוגה", "פילאטיס", "אימון"], slug: "fitness_studio" },
  { words: ["מוסך", "רכב", "צמיגים", "שטיפת רכב"], slug: "auto_service" },
  { words: ["שרברב", "אינסטלטור", "חשמלאי", "מנעולן", "צבע", "הובלות", "אצל הלקוח"], slug: "trades_onsite" },
  { words: ["חנות", "קמעונאות", "סופר", "מכולת", "אופטיקה"], slug: "retail_store" },
  { words: ["עורך דין", "עו\"ד", "רואה חשבון", "רו\"ח", "יועץ", "ייעוץ", "סוכן ביטוח", "נדל\"ן", "אדריכל"], slug: "professional_services" },
  { words: ["חינוך", "הכשרה", "קורס", "בית ספר", "גן ילדים", "מורה"], slug: "education_training" },
];

// קומפילציה פעם אחת בטעינת המודול, כמו COMPILED_PAIN_RULES ב-matching.ts
const COMPILED_ANSWER_KEYWORDS = ANSWER_KEYWORDS.map(
  (rule) => ({ patterns: rule.words.map(compileKeyword), slug: rule.slug }),
);

const NONE: IndustryResult = Object.freeze({ slug: "unknown", confidence: "none", source: "none" });

/** ענף לפי מה שגוגל מדווחת. primaryType קודם (ביטחון גבוה), ואז ההתאמה הראשונה ב-types. */
export function industryFromPlaces(primaryType?: string, types?: readonly string[]): IndustryResult {
  const primary = primaryType != null ? TYPE_TO_INDUSTRY[primaryType] : undefined;
  if (primary != null) return { slug: primary, confidence: "high", source: "places_primary" };
  // הסדר של types הוא הסדר של גוגל, מהספציפי לגנרי - ולכן ההתאמה הראשונה היא הטובה ביותר
  for (const t of types ?? []) {
    const hit = TYPE_TO_INDUSTRY[t];
    if (hit != null) return { slug: hit, confidence: "medium", source: "places_types" };
  }
  return NONE;
}

/** ענף לפי תשובת בעל העסק בראיון. תווית מהבנק נתפסת מדויק; טקסט חופשי לפי מילות מפתח. */
export function industryFromAnswer(answer: unknown): IndustryResult {
  if (typeof answer !== "string") return NONE;
  const text = answer.trim();
  if (text.length === 0) return NONE;
  for (const slug of INDUSTRIES) {
    if (INDUSTRY_LABEL_HE[slug] === text) return { slug, confidence: "high", source: "interview" };
  }
  for (const { patterns, slug } of COMPILED_ANSWER_KEYWORDS) {
    if (matchesAnyKeyword(text, patterns)) return { slug, confidence: "high", source: "interview" };
  }
  return NONE;
}

export const INDUSTRY_MODEL_FIELD = "industry";

/**
 * הענף של העסק. **הראיון גובר על הסריקה תמיד** (הכרעה 6.5) - גם כשגוגל בטוחה וגם כשהיא
 * שותקת. אין ברירת מחדל: כשאף שכבה לא זיהתה, התוצאה היא unknown, ומנוע ההתאמה יראה
 * לעסק הזה רק פריטים כלליים.
 */
export function industryOf(findings: ScanFindings, model: BusinessModel | null): IndustryResult {
  const answered = industryFromAnswer(model?.data?.profile?.[INDUSTRY_MODEL_FIELD]);
  if (answered.slug !== "unknown") return answered;
  return industryFromPlaces(findings.business.primaryType, findings.business.types);
}
