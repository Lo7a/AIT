import type { ScanFindings } from "../types";
import type { DimensionDef } from "./types";
import { noGbp, crawlUsable, reviewsAnalyzed } from "../evidence";
import { SOCIAL_PLATFORM_LABEL_HE, socialPresenceOf } from "../social-hosts";

// עזר "ידוע" מקומי לממד הזה בלבד — לא משותף (רק accessibility צריך אותו)
const phoneFound = (f: ScanFindings) => !!f.business.phone || !!f.websiteSignals?.hasPhoneLink;
// "חוזרת" = עולה יותר מפעם אחת במדגם שנבדק, לא כל תמה שצוינה
const recurringProblems = (f: ScanFindings) =>
  (f.reviewInsights?.problemThemes ?? []).filter((t) => t.count >= 2);

const sec = (ms?: number) => ((ms ?? 0) / 1000).toFixed(1);

// has_website "הושג" = יש כתובת רשומה, היא לא נכשלה כפול (crawl+PSI), והיא לא עמוד חברתי -
// עמוד פייסבוק הוא לא "יש אתר" (סקירת קוד: לפני התיקון עמוד חברתי היה מרוויח את החוק הזה כי
// אין לו כלל crawl_failed/pagespeed_failed - הדגלים האלה נדלגים בכוונה על אתר חברתי ב-scan.ts)
const hasWebsiteEarned = (f: ScanFindings) =>
  !f.partial.includes("no_website")
  && !(f.partial.includes("crawl_failed") && f.partial.includes("pagespeed_failed"))
  && !f.socialOnly;

// נוכחות חברתית לצורך "אתר עצמאי": socialOnly הוא המקור העדכני (נקבע בזמן הסריקה), אבל נופלים חזרה
// לזיהוי מחדש מ-business.website כדי לכסות שורות סריקה ישנות/שנוקדו-מחדש בלי socialOnly (סקירת קוד -
// אבן דרך 4 משימה 1 מרעננת ציונים מ-findings שמורים בלי לחזור ולסרוק)
const socialPlatformOf = (f: ScanFindings): string | undefined =>
  f.socialOnly?.platform ?? socialPresenceOf(f.business.website ?? "")?.platform;
const isSocialPresence = (f: ScanFindings) => socialPlatformOf(f) != null;

export const DIMENSIONS: DimensionDef[] = [
  {
    key: "visibility", label: "נראות דיגיטלית", weight: 0.2,
    rules: [
      {
        key: "gbp_exists", points: 20,
        known: () => true, earned: (f) => !noGbp(f),
        gapText: () => "העסק לא קיים במפות גוגל, לקוחות שמחפשים בסביבה פשוט לא מוצאים אותו",
        okText: () => "לעסק פרופיל פעיל בגוגל",
      },
      {
        key: "has_website", points: 5,
        known: () => true,
        // אתר רשום שה-crawl וה-PageSpeed שניהם נכשלו בו הוא ככל הנראה לא זמין גם ללקוח, ועמוד
        // ברשת חברתית הוא לא "יש אתר" (hasWebsiteEarned - סקירת קוד)
        earned: hasWebsiteEarned,
        gapText: (f) => f.partial.includes("no_website")
          ? "לעסק אין אתר, אין בית דיגיטלי להפנות אליו לקוחות"
          : f.socialOnly
            ? "האתר הרשום הוא בעצם עמוד ברשת חברתית, לא אתר עצמאי"
            : noGbp(f)
              ? "לא הצלחנו לטעון את האתר, ייתכן שהוא לא זמין גם ללקוחות"
              : "האתר רשום בגוגל אך לא הצלחנו לטעון אותו, ייתכן שהוא לא זמין גם ללקוחות",
        okText: () => "לעסק יש אתר",
      },
      {
        key: "own_website", points: 15,
        // "אתר עצמאי" (אבן דרך 4, משימה 0): known תמיד true (סקירת קוד C1) - זה חוק שמחפש עדות
        // חיובית, לא רק "יש כתובת"; עסק בלי שום נוכחות דיגיטלית פשוט לא זכה בו, בדיוק כמו שהוא לא
        // זכה בשום חוק ידע-חיובי אחר. earned דורש גם שהאתר לא חברתי וגם שהוא עבד בפועל (hasWebsiteEarned) -
        // אתר מת (crawl+PSI נכשלו) לא "זוכה" כאן רק כי הוא לא חברתי (סקירת קוד C2)
        known: () => true,
        earned: (f) => !isSocialPresence(f) && hasWebsiteEarned(f),
        gapText: (f) => {
          const platform = socialPlatformOf(f);
          if (platform) {
            const label = SOCIAL_PLATFORM_LABEL_HE[platform] ?? platform;
            return `הנוכחות הדיגיטלית של העסק היא עמוד ${label} ולא אתר עצמאי, אין דף שהעסק שולט בו ויכול להציג בו מחירים ולסגור ממנו לידים`;
          }
          return "לעסק אין אתר עצמאי משלו";
        },
        okText: () => "לעסק אתר עצמאי משלו, לא רק עמוד ברשת חברתית",
      },
      {
        key: "perf", points: 20,
        known: (f) => f.pageSpeed?.performanceScore != null,
        earned: (f) => (f.pageSpeed?.performanceScore ?? 0) >= 70,
        gapText: (f) => `ציון ביצועי מובייל ${f.pageSpeed?.performanceScore}/100 - מתחת ליעד של 70, מבקרים במובייל נוטים לנטוש`,
        okText: (f) => `ביצועי מובייל טובים (${f.pageSpeed?.performanceScore}/100)`,
      },
      {
        key: "lcp", points: 15,
        known: (f) => f.pageSpeed?.lcpMs != null,
        earned: (f) => (f.pageSpeed?.lcpMs ?? Infinity) <= 4000,
        gapText: (f) => `העמוד הראשי נטען ${sec(f.pageSpeed?.lcpMs)} שניות, מעל היעד של 4 שניות`,
        okText: (f) => `זמן טעינה תקין (${sec(f.pageSpeed?.lcpMs)} שניות)`,
      },
      {
        key: "seo", points: 10,
        known: (f) => f.pageSpeed?.seoScore != null,
        earned: (f) => (f.pageSpeed?.seoScore ?? 0) >= 90,
        gapText: (f) => `ציון SEO ${f.pageSpeed?.seoScore}/100, יש כשלים בסיסיים באופטימיזציה למנועי חיפוש`,
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
        gapText: () => "עדיין אין דירוג בגוגל, הפרופיל חדש או לא פעיל",
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
        gapText: (f) => {
          const n = f.business.reviewCount ?? 0;
          if (n === 0) return "אין ביקורות בגוגל, לקוח חדש לא רואה שום הוכחה חברתית";
          if (n === 1) return "רק ביקורת אחת בגוגל, מעט מדי בשביל לבנות אמון";
          return `רק ${n} ביקורות בגוגל, מעט מדי בשביל לבנות אמון`;
        },
        okText: (f) => `${f.business.reviewCount} ביקורות בגוגל`,
      },
      {
        key: "review_volume", points: 15,
        known: (f) => !noGbp(f), earned: (f) => (f.business.reviewCount ?? 0) >= 25,
        gapText: () => "מאגר הביקורות קטן, איסוף ביקורות יזום יחזק את הנראות המקומית",
        okText: () => "מאגר ביקורות מכובד",
      },
      {
        key: "rating_good", points: 25,
        known: (f) => f.business.rating != null, earned: (f) => (f.business.rating ?? 0) >= 4.2,
        gapText: (f) => `דירוג ${f.business.rating}, מתחת לרף האמון של 4.2`,
        okText: (f) => `דירוג מצוין: ${f.business.rating}`,
      },
      {
        key: "no_problem_themes", points: 25,
        known: reviewsAnalyzed,
        earned: (f) => recurringProblems(f).length === 0,
        gapText: (f) => `במדגם הביקורות שנבדק חוזרות בעיות: ${recurringProblems(f).slice(0, 2).map((t) => t.theme.slice(0, 80)).join("; ")}`,
        okText: () => "במדגם הביקורות שנבדק לא עולות בעיות חוזרות",
      },
      {
        key: "positive_themes", points: 15,
        known: reviewsAnalyzed,
        earned: (f) => (f.reviewInsights?.positiveThemes.length ?? 0) > 0,
        gapText: () => "לא זוהו חוזקות עקביות בביקורות",
        okText: (f) => `לקוחות מפרגנים: ${f.reviewInsights?.positiveThemes[0]?.theme.slice(0, 80)}`,
      },
    ],
  },
  {
    key: "accessibility", label: "נגישות ללקוח", weight: 0.25,
    rules: [
      {
        key: "phone_available", points: 15,
        // חיובי (נמצא טלפון) תמיד ידוע — זו עובדה שנמצאה, לא מסקנה מהיעדר מידע.
        // שלילי ("אין טלפון") ידוע רק כששני המקורות האפשריים נבדקו בפועל: GBP קיים,
        // וה-crawl עבד (או שאין בכלל אתר לבדוק).
        known: (f) => phoneFound(f) || (!noGbp(f) && (crawlUsable(f) || f.partial.includes("no_website"))),
        earned: phoneFound,
        gapText: () => "לא מצאנו מספר טלפון נגיש ללקוח",
        okText: () => "טלפון נגיש ללקוחות",
      },
      {
        key: "whatsapp", points: 25,
        // גילוי חיובי תקף גם באתר js_rendered — קישור שנמצא הוא נמצא. רק "לא נמצא" דורש crawl אמין.
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasWhatsappLink,
        earned: (f) => !!f.websiteSignals?.hasWhatsappLink,
        gapText: () => "אין קישור וואטסאפ באתר, הערוץ שלקוחות ישראלים מצפים לו",
        okText: () => "וואטסאפ זמין באתר",
      },
      {
        key: "contact_form", points: 15,
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasContactForm,
        earned: (f) => !!f.websiteSignals?.hasContactForm,
        gapText: () => "אין טופס יצירת קשר באתר, לידים הולכים לאיבוד",
        okText: () => "יש טופס יצירת קשר",
      },
      {
        key: "online_booking", points: 30,
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasOnlineBooking,
        earned: (f) => !!f.websiteSignals?.hasOnlineBooking,
        gapText: () => "אין קביעת תור/הזמנה אונליין, כל תיאום דורש טלפון בשעות הפעילות",
        okText: () => "יש קביעת תור אונליין",
      },
      {
        key: "email_link", points: 15,
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasEmailLink,
        earned: (f) => !!f.websiteSignals?.hasEmailLink,
        gapText: () => "אין כתובת אימייל נגישה באתר",
        okText: () => "אימייל נגיש באתר",
      },
    ],
  },
  {
    key: "infrastructure", label: "תשתית דיגיטלית", weight: 0.15,
    rules: [
      {
        key: "analytics", points: 35,
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasGoogleAnalytics,
        earned: (f) => !!f.websiteSignals?.hasGoogleAnalytics,
        gapText: () => "אין Google Analytics, העסק עיוור לתנועה באתר שלו",
        okText: () => "יש מדידת תנועה (Analytics)",
      },
      {
        key: "fb_pixel", points: 30,
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasFacebookPixel,
        earned: (f) => !!f.websiteSignals?.hasFacebookPixel,
        gapText: () => "אין פיקסל פייסבוק, אי אפשר לעשות רימרקטינג למבקרים",
        okText: () => "פיקסל פייסבוק מותקן",
      },
      {
        key: "chat_widget", points: 20,
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasChatWidget,
        earned: (f) => !!f.websiteSignals?.hasChatWidget,
        gapText: () => "אין צ'אט באתר, פניות מחוץ לשעות הפעילות אובדות",
        okText: () => "יש צ'אט באתר",
      },
      {
        key: "multi_page", points: 15,
        known: crawlUsable, earned: (f) => (f.websiteSignals?.pagesCrawled ?? 0) >= 4,
        gapText: () => "בסריקה נמצאו עמודים בודדים בלבד, אתר רזה מקשה על לקוחות למצוא מידע",
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
