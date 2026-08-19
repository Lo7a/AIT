import * as cheerio from "cheerio";
import type { SchemaMarkup } from "../types";

// האם האתר מצהיר לגוגל, בסימון מובנה (schema.org), שהוא עסק מקומי.
//
// למה זה משנה: בלי סימון LocalBusiness האתר לא כשיר בכלל לתוצאה המקומית העשירה
// (כרטיס עם שעות, טלפון, דירוג). זה פער אמיתי ובר-תיקון, לא נתון תיאורטי.
//
// אזהרה לצד הקורא (הפונקציה הזו לא אוכפת אותה, הקורא חייב): אתר שהתוכן שלו מרונדר
// בצד לקוח יכול להחזיק סימון תקין לגמרי ש-fetch פשוט לא רואה. הסריקה כבר עוקבת אחרי
// זה בשדה jsRendered ב-WebsiteSignals. הפונקציה כאן מדווחת אך ורק על מה שיש ב-HTML
// שקיבלה; כש-jsRendered=true על הקורא להשתיק את הממצא השלילי ולדווח "לא נבדק",
// אחרת נאשים אתר תקין בחוסר שאין לנו דרך לראות. אל תחווט אחרת.
//
// ערך מוחזר: undefined = לא נבדק כלום (קלט ריק או לא HTML). hasLocalBusiness=false
// מותר רק אחרי פענוח אמיתי של עמוד שבו לא נמצא אף סוג מהעץ. types מציג את הראיה
// עצמה (הסוגים שנמצאו בפועל), כדי שהדוח יראה ממצא ולא יכריז מסקנה.

// עץ LocalBusiness המלא של schema.org (131 סוגים, כולל השורש עצמו), נגזר אוטומטית
// מ-schemaorg-current-https.jsonld על ידי מעבר רקורסיבי על rdfs:subClassOf.
// למה לא רשימה ידנית: עסק שמסומן נכון מצהיר כמעט תמיד על תת-הסוג הספציפי
// (CafeOrCoffeeShop, HairSalon, Dentist), לא על ההורה. רשימה ידנית של כמה שמות
// הייתה אומרת לבית קפה אמיתי שאין לו סימון עסק מקומי - בדיוק ההאשמה השקרית
// שכלל הכנות אוסר. Organization / WebSite / WebPage אינם בעץ ובכוונה לא נספרים.
const LOCAL_BUSINESS_TYPES: readonly string[] = [
  "AccountingService", "AdultEntertainment", "AmusementPark", "AnimalShelter",
  "ArchiveOrganization", "ArtGallery", "Attorney", "AutoBodyShop", "AutoDealer",
  "AutoPartsStore", "AutoRental", "AutoRepair", "AutoWash", "AutomatedTeller",
  "AutomotiveBusiness", "Bakery", "BankOrCreditUnion", "BarOrPub", "BeautySalon",
  "BedAndBreakfast", "BikeStore", "BookStore", "BowlingAlley", "Brewery",
  "CafeOrCoffeeShop", "Campground", "Casino", "ChildCare", "ClothingStore",
  "ComedyClub", "ComputerStore", "ConvenienceStore", "CovidTestingFacility",
  "DaySpa", "Dentist", "DepartmentStore", "Distillery", "DryCleaningOrLaundry",
  "Electrician", "ElectronicsStore", "EmergencyService", "EmploymentAgency",
  "EntertainmentBusiness", "ExerciseGym", "FastFoodRestaurant", "FinancialService",
  "FireStation", "Florist", "FoodEstablishment", "FurnitureStore", "GardenStore",
  "GasStation", "GeneralContractor", "GolfCourse", "GovernmentOffice", "GroceryStore",
  "HVACBusiness", "HairSalon", "HardwareStore", "HealthAndBeautyBusiness", "HealthClub",
  "HobbyShop", "HomeAndConstructionBusiness", "HomeGoodsStore", "Hospital", "Hostel",
  "Hotel", "HousePainter", "IceCreamShop", "IndividualPhysician", "InsuranceAgency",
  "InternetCafe", "JewelryStore", "LegalService", "Library", "LiquorStore",
  "LocalBusiness", "Locksmith", "LodgingBusiness", "MedicalBusiness", "MedicalClinic",
  "MensClothingStore", "MobilePhoneStore", "Motel", "MotorcycleDealer",
  "MotorcycleRepair", "MovieRentalStore", "MovieTheater", "MovingCompany", "MusicStore",
  "NailSalon", "NightClub", "Notary", "OfficeEquipmentStore", "Optician", "OutletStore",
  "PawnShop", "PetStore", "Pharmacy", "Physician", "PhysiciansOffice", "Plumber",
  "PoliceStation", "PostOffice", "ProfessionalService", "PublicSwimmingPool",
  "RadioStation", "RealEstateAgent", "RecyclingCenter", "Resort", "Restaurant",
  "RoofingContractor", "SelfStorage", "ShoeStore", "ShoppingCenter", "SkiResort",
  "SportingGoodsStore", "SportsActivityLocation", "SportsClub", "StadiumOrArena",
  "Store", "TattooParlor", "TelevisionStation", "TennisComplex", "TireShop",
  "TouristInformationCenter", "ToyStore", "TravelAgency", "VacationRental",
  "WholesaleStore", "Winery",
];

// ההשוואה חסרת רגישות לאותיות גדולות/קטנות - בשטח נכתב גם "localbusiness"
const LOCAL_BUSINESS_LOOKUP = new Set(LOCAL_BUSINESS_TYPES.map((t) => t.toLowerCase()));

// כתובת schema.org בכל הצורות שמופיעות בשטח: http/https, עם או בלי www,
// ופרוטוקול-יחסי (//schema.org/). זו גם המסננת של microdata - itemtype שאינו
// schema.org (למשל data-vocabulary.org הישן) אינו סוג שאנחנו יודעים לפרש
const SCHEMA_URL_RE = /^(?:https?:)?\/\/(?:www\.)?schema\.org\//i;
// שם סוג תקין אחרי הנרמול. חוסם זבל (URL זר, מחרוזת ריקה, prefix לא מוכר)
const TYPE_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
// קלט בלי אף תגית אינו עמוד HTML שפענחנו (גוף שגיאה, JSON, טקסט) - "לא נבדק"
const ANY_TAG_RE = /<[a-z!/]/i;
// תקרת עומק לרקורסיה: העמודים שנסרקים הם קלט חיצוני לא אמין, ומבנה מקונן לעומק
// פתולוגי לא יפיל את הסורק. סימון אמיתי לא מתקרב לעומק כזה
const MAX_DEPTH = 20;

/** שם סוג schema.org מנורמל, או undefined אם זה לא סוג schema.org בכלל */
function normalizeTypeName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  let name = raw.trim().replace(/\/+$/, "");
  if (SCHEMA_URL_RE.test(name)) name = name.replace(SCHEMA_URL_RE, "");
  else if (name.toLowerCase().startsWith("schema:")) name = name.slice("schema:".length);
  if (!TYPE_NAME_RE.test(name)) return undefined;
  return name;
}

// תוכן <script> בתבניות ישנות עטוף לא פעם בהערת HTML או ב-CDATA. בלי הסרה
// JSON.parse ייפול על סימון תקין לחלוטין ונדווח "אין" על עסק שכן הצהיר
function unwrapScriptText(text: string): string {
  return text
    .trim()
    .replace(/^<!--/, "")
    .replace(/-->$/, "")
    .trim()
    .replace(/^(?:\/\/\s*)?<!\[CDATA\[/, "")
    .replace(/(?:\/\/\s*)?\]\]>$/, "")
    .trim();
}

// מעבר רקורסיבי על ערך JSON-LD מפוענח. אין טיפול מיוחד ב-@graph או בישויות מקוננות
// (mainEntity, publisher, about) - כולן פשוט ענפים במסע הזה, וכך נתפסות כל צורות
// העטיפה שקיימות בשטח בלי לנחש איזו תבנית ייצרה את העמוד
function collectFromJsonLd(value: unknown, depth: number, push: (name: string) => void): void {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectFromJsonLd(item, depth + 1, push);
    return;
  }
  const obj = value as Record<string, unknown>;
  const rawType = obj["@type"];
  for (const candidate of Array.isArray(rawType) ? rawType : [rawType]) {
    const name = normalizeTypeName(candidate);
    if (name !== undefined) push(name);
  }
  for (const [key, child] of Object.entries(obj)) {
    if (key === "@type") continue;
    collectFromJsonLd(child, depth + 1, push);
  }
}

/** cheerio.load על קלט זר עלול לזרוק - כישלון פענוח הוא "לא נבדק", לא "אין" */
function loadHtml(html: string): ReturnType<typeof cheerio.load> | undefined {
  try {
    return cheerio.load(html);
  } catch {
    return undefined;
  }
}

/**
 * פונקציה טהורה: HTML פנימה, סימון schema.org החוצה. בלי רשת, בלי מצב.
 * undefined = לא נבדק. אובייקט = נבדק בפועל, ו-types הוא הראיה.
 */
export function readSchemaMarkup(html: string): SchemaMarkup | undefined {
  if (typeof html !== "string") return undefined;
  const trimmed = html.trim();
  if (trimmed.length === 0 || !ANY_TAG_RE.test(trimmed)) return undefined;

  const $ = loadHtml(html);
  if ($ === undefined) return undefined;

  const types: string[] = [];
  const seen = new Set<string>();
  const push = (name: string): void => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    types.push(name);
  };

  $('script[type="application/ld+json" i]').each((_i, el) => {
    const text = unwrapScriptText($(el).text() ?? "");
    if (text.length === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return; // בלוק שבור אחד לא מוחק את התקינים שלצידו - זה מצב נפוץ בעמודים חיים
    }
    collectFromJsonLd(parsed, 0, push);
  });

  // microdata: הרבה אתרי עסקים קטנים בישראל בנויים על תבניות ישנות שמסמנות רק כך.
  // itemtype יכול להחזיק כמה כתובות מופרדות ברווח
  $("[itemtype]").each((_i, el) => {
    const raw = $(el).attr("itemtype") ?? "";
    for (const token of raw.split(/\s+/)) {
      if (!SCHEMA_URL_RE.test(token.trim())) continue;
      const name = normalizeTypeName(token);
      if (name !== undefined) push(name);
    }
  });

  return {
    hasLocalBusiness: types.some((t) => LOCAL_BUSINESS_LOOKUP.has(t.toLowerCase())),
    types,
  };
}
