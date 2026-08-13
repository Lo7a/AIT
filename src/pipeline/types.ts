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
  website?: string;
  rating?: number;
  reviewCount?: number;
  reviews: Review[];
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

export interface PageSpeedResult {
  performanceScore?: number; // 0-100
  seoScore?: number;         // 0-100
  lcpMs?: number;
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
  | "no_gbp";

export interface ScanFindings {
  business: {
    placeId: string;
    name: string;
    phone?: string;
    website?: string;
    rating?: number;
    reviewCount?: number;
  };
  websiteSignals?: WebsiteSignals;
  pageSpeed?: PageSpeedResult;
  reviewInsights?: ReviewInsights;
  partial: PartialFlag[]; // איחוד הדגלים האפשריים — ראו PartialFlag
  partialDetails?: Record<string, string>; // דגל → סיבת הכישלון (לעולם בלי טקסט ביקורות)
  meta: ScanMeta;
}
