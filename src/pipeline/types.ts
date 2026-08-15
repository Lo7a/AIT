export interface BusinessCandidate {
  placeId: string;
  name: string;
  address: string;
  rating?: number;
  reviewCount?: number;
}

// הביקורות כאן הן זמניות (in-memory) לצורך ניתוח בלבד — לעולם לא נשמרות לפלט
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
  hasOnlineBooking: boolean;
  hasChatWidget: boolean;
  hasFacebookPixel: boolean;
  hasGoogleAnalytics: boolean;
  platform?: string;
  jsRendered?: boolean; // האתר מרונדר בצד לקוח — האותות מה-HTML הגולמי חלקיים, אסור להסיק מהם "אין"
}

// גרסה מקוצצת של גוף PSI - קטגוריות+ציונים, מדדי ליבה (כולל LCP), ו-loadingExperience אם קיים.
// בלי עץ ה-audits המלא (מיליון שדות, מגה-בייטים) - זה לא בעל ערך עתידי ורק מנפח את השורה
export interface PageSpeedRawTrimmed {
  categories?: unknown;
  metrics?: Record<string, number>;
  loadingExperience?: unknown;
}

export interface PageSpeedResult {
  performanceScore?: number; // 0-100
  seoScore?: number;         // 0-100
  lcpMs?: number;
  // ראו PageSpeedRawTrimmed - לשימוש עתידי (אבן דרך 4 משימה 0.7), לא נצרך בשום מסך היום
  raw?: PageSpeedRawTrimmed;
}

export interface Theme {
  theme: string; // מסקנה קצרה בעברית — בלי ציטוטים ובלי שמות
  count: number;
}

// count של כל תמה תקף רק ביחס ל-totalAnalyzed (מה שנותח בפועל) — לעולם לא ביחס ל-reviewCount הכולל של העסק
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
  | "social_only";

// הסבר דגל js_rendered — משותף ל-runScan ול-scanWebsiteOnly (משימה 3)
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
  };
  websiteSignals?: WebsiteSignals;
  pageSpeed?: PageSpeedResult;
  reviewInsights?: ReviewInsights;
  socialOnly?: SocialOnly;
  partial: PartialFlag[]; // איחוד הדגלים האפשריים — ראו PartialFlag
  partialDetails?: Partial<Record<PartialFlag, string>>; // דגל → סיבת הכישלון (לעולם בלי טקסט ביקורות)
  meta: ScanMeta;
  raw?: ScanRawPayload;
}
