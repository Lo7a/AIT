import type { ScanFindings } from "../types";
import type { DimensionDef } from "./types";

// עזרי "ידוע": מתי מותר בכלל להסיק מהאותות
const noGbp = (f: ScanFindings) => f.partial.includes("no_gbp");
const crawlUsable = (f: ScanFindings) => !!f.websiteSignals && !f.partial.includes("js_rendered");
const reviewsAnalyzed = (f: ScanFindings) => !!f.reviewInsights && f.reviewInsights.totalAnalyzed > 0;

const sec = (ms?: number) => ((ms ?? 0) / 1000).toFixed(1);

export const DIMENSIONS: DimensionDef[] = [
  {
    key: "visibility", label: "נראות דיגיטלית", weight: 0.2,
    rules: [
      {
        key: "gbp_exists", points: 20,
        known: () => true, earned: (f) => !noGbp(f),
        gapText: () => "העסק לא קיים במפות גוגל — לקוחות שמחפשים בסביבה פשוט לא מוצאים אותו",
        okText: () => "לעסק פרופיל פעיל בגוגל",
      },
      {
        key: "has_website", points: 20,
        known: () => true, earned: (f) => !f.partial.includes("no_website"),
        gapText: () => "לעסק אין אתר — אין בית דיגיטלי להפנות אליו לקוחות",
        okText: () => "לעסק יש אתר",
      },
      {
        key: "perf", points: 20,
        known: (f) => f.pageSpeed?.performanceScore != null,
        earned: (f) => (f.pageSpeed?.performanceScore ?? 0) >= 70,
        gapText: (f) => `ציון ביצועי מובייל ${f.pageSpeed?.performanceScore}/100 — אתר איטי מבריח לקוחות`,
        okText: (f) => `ביצועי מובייל טובים (${f.pageSpeed?.performanceScore}/100)`,
      },
      {
        key: "lcp", points: 15,
        known: (f) => f.pageSpeed?.lcpMs != null,
        earned: (f) => (f.pageSpeed?.lcpMs ?? Infinity) <= 4000,
        gapText: (f) => `העמוד הראשי נטען ${sec(f.pageSpeed?.lcpMs)} שניות — הרבה מעל היעד של 4`,
        okText: (f) => `זמן טעינה תקין (${sec(f.pageSpeed?.lcpMs)} שניות)`,
      },
      {
        key: "seo", points: 10,
        known: (f) => f.pageSpeed?.seoScore != null,
        earned: (f) => (f.pageSpeed?.seoScore ?? 0) >= 90,
        gapText: (f) => `ציון SEO ${f.pageSpeed?.seoScore}/100 — יש בעיות בסיסיות באינדוקס`,
        okText: (f) => `בסיס SEO תקין (${f.pageSpeed?.seoScore}/100)`,
      },
      {
        key: "gbp_phone", points: 5,
        known: (f) => !noGbp(f), earned: (f) => !!f.business.phone,
        gapText: () => "אין מספר טלפון בפרופיל גוגל",
        okText: () => "טלפון מופיע בפרופיל גוגל",
      },
      {
        key: "gbp_rating", points: 10,
        known: (f) => !noGbp(f), earned: (f) => f.business.rating != null,
        gapText: () => "אין דירוג בגוגל — סימן לפרופיל רדום",
        okText: (f) => `דירוג ${f.business.rating} בגוגל`,
      },
    ],
  },
  {
    key: "reputation", label: "מוניטין וביקורות", weight: 0.2,
    rules: [
      {
        key: "has_reviews", points: 20,
        known: (f) => !noGbp(f), earned: (f) => (f.business.reviewCount ?? 0) >= 5,
        gapText: (f) => `רק ${f.business.reviewCount ?? 0} ביקורות בגוגל — מעט מדי בשביל לבנות אמון`,
        okText: (f) => `${f.business.reviewCount} ביקורות בגוגל`,
      },
      {
        key: "review_volume", points: 15,
        known: (f) => !noGbp(f), earned: (f) => (f.business.reviewCount ?? 0) >= 25,
        gapText: () => "מאגר הביקורות קטן — איסוף ביקורות יזום יחזק את הנראות המקומית",
        okText: () => "מאגר ביקורות מכובד",
      },
      {
        key: "rating_good", points: 25,
        known: (f) => f.business.rating != null, earned: (f) => (f.business.rating ?? 0) >= 4.2,
        gapText: (f) => `דירוג ${f.business.rating} — מתחת לרף האמון של 4.2`,
        okText: (f) => `דירוג מצוין: ${f.business.rating}`,
      },
      {
        key: "no_problem_themes", points: 25,
        known: reviewsAnalyzed,
        earned: (f) => (f.reviewInsights?.problemThemes.length ?? 0) === 0,
        gapText: (f) => `הביקורות חוזרות על בעיות: ${f.reviewInsights?.problemThemes.slice(0, 2).map((t) => t.theme).join("; ")}`,
        okText: () => "לא עולות בעיות חוזרות מהביקורות",
      },
      {
        key: "positive_themes", points: 15,
        known: reviewsAnalyzed,
        earned: (f) => (f.reviewInsights?.positiveThemes.length ?? 0) > 0,
        gapText: () => "לא זוהו חוזקות עקביות בביקורות",
        okText: (f) => `לקוחות מפרגנים: ${f.reviewInsights?.positiveThemes[0]?.theme}`,
      },
    ],
  },
  {
    key: "accessibility", label: "נגישות ללקוח", weight: 0.25,
    rules: [
      {
        key: "phone_available", points: 15,
        // תיקון מסקירת משימה 3: לא known: () => true — עסק ללא GBP (no_gbp) שה-crawl שלו
        // נכשל או מרונדר-JS הוא "אין מידע", לא "אין טלפון" (business.phone תמיד ריק ב-no_gbp).
        known: (f) => !noGbp(f) || crawlUsable(f),
        earned: (f) => !!f.business.phone || !!f.websiteSignals?.hasPhoneLink,
        gapText: () => "אין מספר טלפון נגיש — לא בגוגל ולא באתר",
        okText: () => "טלפון נגיש ללקוחות",
      },
      {
        key: "whatsapp", points: 25,
        known: crawlUsable, earned: (f) => !!f.websiteSignals?.hasWhatsappLink,
        gapText: () => "אין קישור וואטסאפ באתר — הערוץ שלקוחות ישראלים מצפים לו",
        okText: () => "וואטסאפ זמין באתר",
      },
      {
        key: "contact_form", points: 15,
        known: crawlUsable, earned: (f) => !!f.websiteSignals?.hasContactForm,
        gapText: () => "אין טופס יצירת קשר באתר — לידים הולכים לאיבוד",
        okText: () => "יש טופס יצירת קשר",
      },
      {
        key: "online_booking", points: 30,
        known: crawlUsable, earned: (f) => !!f.websiteSignals?.hasOnlineBooking,
        gapText: () => "אין קביעת תור/הזמנה אונליין — כל תיאום דורש טלפון בשעות הפעילות",
        okText: () => "יש קביעת תור אונליין",
      },
      {
        key: "email_link", points: 15,
        known: crawlUsable, earned: (f) => !!f.websiteSignals?.hasEmailLink,
        gapText: () => "אין כתובת אימייל נגישה באתר",
        okText: () => "אימייל נגיש באתר",
      },
    ],
  },
  {
    key: "infrastructure", label: "תשתית דיגיטלית", weight: 0.15,
    rules: [
      {
        key: "analytics", points: 30,
        known: crawlUsable, earned: (f) => !!f.websiteSignals?.hasGoogleAnalytics,
        gapText: () => "אין Google Analytics — העסק עיוור לתנועה באתר שלו",
        okText: () => "יש מדידת תנועה (Analytics)",
      },
      {
        key: "fb_pixel", points: 25,
        known: crawlUsable, earned: (f) => !!f.websiteSignals?.hasFacebookPixel,
        gapText: () => "אין פיקסל פייסבוק — אי אפשר לעשות רימרקטינג למבקרים",
        okText: () => "פיקסל פייסבוק מותקן",
      },
      {
        key: "chat_widget", points: 20,
        known: crawlUsable, earned: (f) => !!f.websiteSignals?.hasChatWidget,
        gapText: () => "אין צ'אט באתר — פניות מחוץ לשעות הפעילות אובדות",
        okText: () => "יש צ'אט באתר",
      },
      {
        key: "platform_known", points: 10,
        known: (f) => !!f.websiteSignals, earned: (f) => f.websiteSignals?.platform != null,
        gapText: () => "פלטפורמת האתר לא זוהתה",
        okText: (f) => `האתר בנוי על ${f.websiteSignals?.platform}`,
      },
      {
        key: "multi_page", points: 15,
        known: crawlUsable, earned: (f) => (f.websiteSignals?.pagesCrawled ?? 0) >= 4,
        gapText: () => "האתר רזה מאוד — עמודים בודדים בלבד",
        okText: (f) => `אתר עם ${f.websiteSignals?.pagesCrawled} עמודים ומעלה`,
      },
    ],
  },
  {
    key: "process", label: "בשלות תהליכים", weight: 0.2,
    // ימולא מהראיון (אבן דרך 3) — עד אז "אין מידע", לא משוקלל ולא מעניש
    rules: [
      {
        key: "lead_handling", points: 40,
        known: () => false, earned: () => false,
        gapText: () => "אין מידע על טיפול בלידים", okText: () => "טיפול בלידים מסודר",
      },
      {
        key: "manual_tasks", points: 30,
        known: () => false, earned: () => false,
        gapText: () => "אין מידע על משימות ידניות", okText: () => "מעט עבודה ידנית חוזרת",
      },
      {
        key: "internal_tools", points: 30,
        known: () => false, earned: () => false,
        gapText: () => "אין מידע על כלים פנימיים", okText: () => "כלים פנימיים מסודרים",
      },
    ],
  },
];
