export interface BusinessCandidate {
  placeId: string;
  name: string;
  address: string;
  rating?: number;
  reviewCount?: number;
}

// הביקורות כאן הן זמניות (in-memory) לצורך ניתוח בלבד - לעולם לא נשמרות לפלט
export interface Review {
  rating: number;
  text: string;
  relativeTime?: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  phone?: string;
  address?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  // סוג העסק לפי גוגל וקואורדינטות (נוספו 20.8 למסכת השדות). primaryType/types הם הבסיס לזיהוי
  // ענף (R1); location נדרש להשוואת מתחרים ברדיוס. שניהם בשכבת Essentials, כלומר בלי תוספת חיוב
  // מעל שדות ה-Enterprise שכבר מבוקשים ממילא.
  // הערה: אין ב-Places API שדה של תשובת בעל העסק לביקורת - אומת מול התיעוד 20.8. האות
  // "האם עונים לביקורות" דורש את Google Business Profile API, שחסום לנו (ראו מחקר מקורות המידע)
  primaryType?: string;
  types?: string[];
  location?: { lat: number; lng: number };
  reviews: Review[];
  // הגוף המלא כפי שהתקבל מ-Places Details - לשימוש עתידי (payload גולמי, אבן דרך 4 משימה 0.7).
  // לעולם לא נגזר ממנו findings.business - השדות שם נבנים במפורש כדי ש-raw לא ידלוף לשם
  raw?: unknown;
}

export interface WebsiteSignals {
  pagesCrawled: number;
  crawledUrls: string[];
  hasContactForm: boolean;
  hasWhatsappLink: boolean;
  hasPhoneLink: boolean;
  hasEmailLink: boolean;
  // כתובת המייל הראשונה שנמצאה בקישור mailto - היעד של הלקוח הסמוי במייל (משימה 10)
  contactEmail?: string;
  hasOnlineBooking: boolean;
  hasChatWidget: boolean;
  hasFacebookPixel: boolean;
  hasGoogleAnalytics: boolean;
  // הזמנות ומשלוחים (נוספו 20.8, מחקר טביעות האצבע): ערוץ הזמנה ישיר שבבעלות העסק לעומת תלות
  // בפלטפורמת צד שלישי. אופציונליים כמו שאר התוספות המאוחרות, כדי לא לשבור fixtures קיימים
  hasOrderingSystem?: boolean;
  hasDeliveryPlatform?: boolean;
  // מקצר כתובות בעמוד: היעד מוסתר, ולכן שלילה של וואטסאפ אינה ידועה (ראו signals.ts)
  hasLinkShortener?: boolean;
  platform?: string;
  jsRendered?: boolean; // האתר מרונדר בצד לקוח - האותות מה-HTML הגולמי חלקיים, אסור להסיק מהם "אין"
  // נגישות (הצהרת נגישות + רכיב נגישות מותקן) - אופציונלי כמו platform/jsRendered כדי לא לשבור
  // fixtures קיימים של WebsiteSignals בכל הבדיקות; crawl.ts תמיד ממלא ערך אמיתי (true/false) בפועל
  hasAccessibilityStatement?: boolean;
  hasAccessibilityWidget?: boolean;
  // תשתית קליינט מזוהה (vue/react/angular) - טביעת אצבע בסמנים ידועים, לא ניחוש (ראו signals.ts).
  // דיווח מייסד (edrieng.co.il): אתר Vue שהטופס האמיתי שלו מרונדר בדפדפן - ה-HTML הגולמי לא מכיל
  // אף <form>. כשהשדה הזה מוגדר וסיגנל שלילי (contact_form/online_booking/chat_widget) לא נמצא,
  // dimensions.ts מדווח "לא נבדק" במקום פער מבוטח - אסור לטעון "אין" ממה שפשוט לא ראינו
  clientFramework?: string;
  // סימון schema.org מעמוד הבית. נקרא בזמן הזחילה כי ה-HTML כבר ביד, ומועתק
  // ל-findings.health.schema ב-scan.ts (שם הוא נבדק יחד עם שאר בדיקות התקינות)
  schema?: SchemaMarkup;
}

// גרסה מקוצצת של גוף PSI - קטגוריות+ציונים, מדדי ליבה (כולל LCP), ושתי חוויות הטעינה
// אם קיימות. בלי עץ ה-audits המלא (מיליון שדות, מגה-בייטים) - זה לא בעל ערך עתידי ורק מנפח את השורה
export interface PageSpeedRawTrimmed {
  categories?: unknown;
  metrics?: Record<string, number>;
  loadingExperience?: unknown;
  originLoadingExperience?: unknown;
}

// CrUX: מדידה של גולשים אמיתיים בכרום, בניגוד ל-lab שהוא ריצה מדומה אחת על מכונה של גוגל
export type FieldCategory = "FAST" | "AVERAGE" | "SLOW";
// page = הכתובת שנבדקה, origin = כל הדומיין (גוגל עצמה נופלת למקור כשאין די תנועה לעמוד)
export type FieldScope = "page" | "origin";

export interface FieldExperience {
  lcpMs?: number;             // אחוזון 75 של גולשים אמיתיים
  lcpCategory?: FieldCategory;
  overall?: FieldCategory;
  scope: FieldScope;
}

export interface PageSpeedResult {
  performanceScore?: number; // 0-100
  seoScore?: number;         // 0-100
  accessibilityScore?: number; // 0-100 - קטגוריית ACCESSIBILITY של PSI (בדיקת נגישות אוטומטית)
  lcpMs?: number;            // lab: ריצה מדומה אחת, רועשת מאוד
  // נתוני שדה כשגוגל מחזירה אותם. היעדרם אינו ממצא: הוא אומר "אין די תנועה למדידה",
  // לא "אין לעסק תנועה" - ראו dimensions.ts
  field?: FieldExperience;
  // ראו PageSpeedRawTrimmed - לשימוש עתידי (אבן דרך 4 משימה 0.7), לא נצרך בשום מסך היום
  raw?: PageSpeedRawTrimmed;
}

// ===== בדיקות תקינות שלא עוברות דרך הסורק או PSI =====
// כלל אחיד ומחייב לכל הטיפוסים כאן: שדה חסר (undefined) פירושו "לא נבדק", לעולם לא
// "אין". רק ערך בוליאני מפורש הוא ממצא. אם הבדיקה נכשלה או לא רצה - האובייקט כולו
// חסר, וחוקי הניקוד מדווחים known=false (ראו score/dimensions.ts)

export interface DomainHealth {
  registrar?: string;
  createdAt?: string;   // ISO
  expiresAt?: string;   // ISO
  daysToExpiry?: number;
}

export interface MailHealth {
  // טביעת אצבע של ספק הדואר לפי רשומות ה-MX (google workspace / microsoft 365 וכו')
  provider?: string;
  hasMx?: boolean;
  hasSpf?: boolean;
  hasDmarc?: boolean;
  // "יש יותר מרשומה אחת מהסוג הזה". בשני התקנים ריבוי רשומות אינו הגנה כפולה אלא ביטול:
  // ב-SPF זו permerror (RFC 7208) וב-DMARC המדיניות נזרקת (RFC 7489). לכן hasSpf/hasDmarc
  // לבדם אינם מספיקים כדי לקבוע שההגנה עובדת - ראו dns-mail.ts
  spfConflict?: boolean;
  dmarcConflict?: boolean;
}

export interface SchemaMarkup {
  hasLocalBusiness?: boolean;
  // סוגי schema.org שנמצאו בפועל בעמוד, לצורך שקיפות בדוח
  types?: string[];
}

export interface SafeBrowsingCheck {
  flagged?: boolean;
  checkedAt?: string;   // ISO - חובה להצגה: ממצא אבטחה תקף רק לרגע הבדיקה
}

export interface HealthSignals {
  domain?: DomainHealth;
  mail?: MailHealth;
  schema?: SchemaMarkup;
  safeBrowsing?: SafeBrowsingCheck;
}

// ערוצי הפנייה של הלקוח הסמוי (משימה 10): מייל וטופס נשלחים אוטומטית; וואטסאפ וטלפון נשלחים
// ביד מהטלפון של החברה ומתועדים במסך הניהול (הכרעת מייסד 30.8 - בלי תלות ב-API של מטא)
export type MysteryChannel = "email" | "form" | "whatsapp" | "phone";

export interface MysteryProbeResult {
  channel: MysteryChannel;
  sentAt: string;       // ISO - מתי הפנייה יצאה בפועל
  answeredAt?: string;  // ISO - חסר = לא נענתה עד closedAt
  closedAt: string;     // ISO - תשובה, או תום ההמתנה
}

// בדיקה אחת היא נקודה אחת עם תאריך, לא שיעור - "80% מהפניות נופלות" מבדיקה אחת הוא מספר מומצא
export interface MysteryEvidence {
  results: MysteryProbeResult[];
}

export interface Theme {
  theme: string; // מסקנה קצרה בעברית - בלי ציטוטים ובלי שמות
  count: number;
}

// count של כל תמה תקף רק ביחס ל-totalAnalyzed (מה שנותח בפועל) - לעולם לא ביחס ל-reviewCount הכולל של העסק
export interface ReviewInsights {
  totalAnalyzed: number;
  positiveThemes: Theme[];
  problemThemes: Theme[];
}

export interface ScanMeta {
  startedAt: string;
  durationMs: number;
  placesCalls: number;
  llmInputTokens: number;
  llmOutputTokens: number;
  estCostUsd: number;
}

export type PartialFlag =
  | "no_website"
  | "few_reviews"
  | "no_review_text"
  | "crawl_failed"
  | "pagespeed_failed"
  | "review_analysis_failed"
  | "js_rendered"
  | "no_gbp"
  | "social_only"
  // כשלי בדיקות התקינות (תחקיר 21.8): תיעוד סיבת האיסוף בלבד. השדה ב-health נשאר חסר
  // והחוק מדווח "לא נבדק" - הדגל לעולם לא הופך לקביעה שלילית על העסק
  | "health_domain_failed"
  | "health_mail_failed"
  | "health_safebrowsing_failed"
  // deps.health עצמו נדחה - אף אחת משלוש הבדיקות לא הספיקה לדווח
  | "health_failed";

// הסבר דגל js_rendered - משותף ל-runScan ול-scanWebsiteOnly (משימה 3)
export const JS_RENDERED_DETAIL = "האתר מרונדר ב-JavaScript - אותות ה-HTML חלקיים";

// "האתר" של העסק הוא בעצם עמוד ברשת חברתית (ממצא מייסד, אבן דרך 4 משימה 0) - ראו social-hosts.ts.
// זו עדיין עובדה אמיתית על העסק (ערוץ אמיתי), לא "אין נוכחות דיגיטלית"; פשוט אין אתר עצמאי לסרוק
export interface SocialOnly {
  platform: string;
  url: string;
}

// payload גולמי לכל סריקה (אבן דרך 4, משימה 0.7) - לשימוש עתידי בלבד, לא נצרך בשום מסך היום.
// נשמר בעמודת scans.raw נפרדת מ-findings; בלי HTML גולמי (כבד, חסר ערך עתידי)
export interface ScanRawPayload {
  placeDetails?: unknown; // גוף Places Details המלא (רק במסלול placeId - ראו scan.ts)
  pageSpeed?: PageSpeedRawTrimmed;
  crawledUrls?: string[];
}

export interface ScanFindings {
  business: {
    placeId: string;
    name: string;
    phone?: string;
    address?: string;
    website?: string;
    rating?: number;
    reviewCount?: number;
    // סוג העסק לפי גוגל וקואורדינטות (20.8) - הקלט העתידי ל-industryOf ולהשוואת מתחרים ברדיוס.
    // אופציונליים: סריקות ישנות ומסלול ה-url הישיר לא מכילים אותם, וחסר פירושו "לא ידוע"
    primaryType?: string;
    types?: string[];
    location?: { lat: number; lng: number };
  };
  websiteSignals?: WebsiteSignals;
  pageSpeed?: PageSpeedResult;
  reviewInsights?: ReviewInsights;
  // בדיקות תקינות דומיין/דואר/סימון/אבטחה - כל תת-שדה חסר פירושו "לא נבדק"
  health?: HealthSignals;
  // הלקוח הסמוי (משימה 10, 30.8): נכתב לכאן כשסבב בדיקה נסגר, כי זו ראיה כמו כל אות אחר -
  // וכך חוקי הניקוד קוראים אותה בלי חתימה חדשה. חסר = לא נבדק
  mystery?: MysteryEvidence;
  socialOnly?: SocialOnly;
  partial: PartialFlag[]; // איחוד הדגלים האפשריים - ראו PartialFlag
  partialDetails?: Partial<Record<PartialFlag, string>>; // דגל - סיבת הכישלון (לעולם בלי טקסט ביקורות)
  meta: ScanMeta;
  raw?: ScanRawPayload;
}
