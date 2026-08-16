import * as cheerio from "cheerio";
import type { WebsiteSignals } from "../types";

// סיגנלים של עמוד בודד; ה-crawler ממזג אותם לרמת האתר (WebsiteSignals)
// jsRendered מוחרג - הוא נגזר ברמת האתר (crawl.ts) מהעמוד הראשי, extractSignals לא קובע אותו.
// hasAccessibilityStatement/hasAccessibilityWidget: אופציונליים ב-WebsiteSignals (כדי לא לשבור
// fixtures ישנים בבדיקות), אבל כאן חובה - extractSignals תמיד מחשבת ערך אמיתי, ובלי הדריסה הזו
// הלולאה הגנרית ב-crawl.ts (merged[key] = merged[key] || signals[key]) לא הייתה מתקמפלת (TS לא
// מרשה כתיבה גנרית דרך מפתחות ששייכים ל-boolean|undefined לצד boolean רגיל)
export interface PageSignals
  extends Omit<WebsiteSignals, "pagesCrawled" | "crawledUrls" | "jsRendered" | "hasAccessibilityStatement" | "hasAccessibilityWidget"> {
  internalLinks: string[];
  hasAccessibilityStatement: boolean;
  hasAccessibilityWidget: boolean;
}

// זיהוי לפי דומיינים/קבצים של ספקים - לא לפי מילים בטקסט חופשי, כדי למנוע התרעות שווא
const WHATSAPP_RE = /wa\.me\/|(?:api|web)\.whatsapp\.com|whatsapp:\/\/send/;
// פלטפורמות תורים/הזמנות: בינלאומיות + ישראליות (המקרה החי: פיצרייה עם order.bitetech.co.il
// שקיבלה "אין הזמנה אונליין"). התבנית order\. תופסת סאב-דומיין הזמנות גנרי של ספק
const BOOKING_RE = /calendly|vcita|setmore|simplybook|booking-calendar|bookly|amelia[-a-z]*booking|appointment-booking|tabit|ontopo|bitetech|tenbis|10bis\.co\.il|mishloha|wolt\.com|myvisit|easytable|order\.[a-z0-9-]+\.(?:co\.il|com|il)/;
const CHAT_RE = /tawk\.to|tidio(?:chat)?\.(?:co|com)|intercom(?:cdn)?\.(?:io|com)|crisp\.chat|zdassets|zopim|jivosite|smartsuppchat|xfbml\.customerchat/;
// צ'אט תוצרת-בית (המקרה החי: סבא אדוארד - .chat-fab/.chat-window/togglechat() בקוד התבנית עצמו,
// בלי ספק). זיהוי מבני לפי שמות מחלקות/פונקציות של רכיב צ'אט - לא מילים חופשיות בטקסט
const CUSTOM_CHAT_RE = /chat-(?:fab|window|widget|box|popup|container|launcher|bubble)\b|togglechat\s*\(|openchat\s*\(/;
const FB_PIXEL_RE = /fbq\(|fbevents\.js/;
const GA_RE = /gtag\(|googletagmanager|google-analytics/;
// הצהרת נגישות (תקנות נגישות השירות - חוק שוויון זכויות לאנשים עם מוגבלות): מזהים לפי טקסט
// עוגן ("נגישות" לבד - תיוג תפריט מקובל שמוביל לעמוד ההצהרה - או "הצהרת נגישות" המלאה) או לפי
// href שמפנה לעמוד הצהרה, באנגלית או בעברית מקודדת. רק עוגן <a> - לא טקסט חופשי בעמוד, אחרת כל
// פסקה שמזכירה "נגישות" הייתה נספרת בטעות
const A11Y_STATEMENT_TEXT_RE = /נגישות/;
const A11Y_STATEMENT_HREF_RE = /accessibility[-_]?statement|negishut|הצהרת[-_ ]?נגישות/i;
// ספקי רכיבי נגישות (ווידג'ט) ישראליים ובינלאומיים - טביעת אצבע בקוד הגולמי, לא מילה חופשית
// (אותה פילוסופיה כמו CHAT_RE/BOOKING_RE). accessible-poetry הוא פלאגין וורדפרס ישראלי (נראה חי
// היום). enable\.co\.il עם נקודה מפורשת כדי לא להתנגש עם המילה האנגלית הרגילה "enable"
const A11Y_WIDGET_RE = /userway|equalweb|accessibe|acsbapp|nagich|enable\.co\.il|accessible-poetry|accessiway|negishim/;
// טפסים שאינם יצירת קשר: חיפוש, ניוזלטר, התחברות, עגלה, תגובות בלוג
const NON_CONTACT_FORM_RE = /(?:^|[^a-z])(search|newsletter|subscribe|mc4wp|login|register|cart|coupon|comment)/;
// קישורים לקבצים - לא עמודים, לא נכנסים לתור הסריקה
const ASSET_EXT_RE = /\.(jpe?g|png|gif|webp|svg|avif|pdf|docx?|xlsx?|pptx?|zip|rar|mp4|mp3|csv)$/i;

// זיהוי תשתית קליינט (Vue/React/Angular) - טביעת אצבע לפי סמנים ידועים בקוד הגולמי, לא ניחוש
// (אותה פילוסופיה כמו platform למעלה). המקרה החי: edrieng.co.il, אתר Vue שהטופס האמיתי שלו
// מרונדר בדפדפן - ה-HTML הגולמי לא מכיל אף <form>/<input>. data-v-XXXXXXXX הוא ה-hash שVue
// מזריק לכל אלמנט עם scoped style; __NUXT__/_nuxt/ הם סמני Nuxt (Vue). מארקרי React/Next
// זהים בכוונה ל-JS_APP_ROOT_RE ב-crawl.ts (jsRendered) - כאן ברמת עמוד בודד, לא רמת אתר
const VUE_MARKER_RE = /data-v-[0-9a-f]{6,10}\b|__NUXT__|\/_nuxt\/|vue-router|Vue\.createApp/i;
const REACT_MARKER_RE = /__NEXT_DATA__|self\.__next_f|\/_next\/static\/|data-reactroot|\bid=["']?__next\b/i;
const ANGULAR_MARKER_RE = /\bng-version=/i;

function detectClientFramework(html: string): string | undefined {
  if (VUE_MARKER_RE.test(html)) return "vue";
  if (REACT_MARKER_RE.test(html)) return "react";
  if (ANGULAR_MARKER_RE.test(html)) return "angular";
  return undefined;
}

// פונקציה טהורה: HTML פנימה, סיגנלים החוצה. בלי רשת, בלי מצב.
// baseUrl = כתובת העמוד הזה עצמו - משמשת לפתרון קישורים יחסיים ולבדיקת same-origin
export function extractSignals(html: string, baseUrl: string): PageSignals {
  const $ = cheerio.load(html);
  const lowerHtml = html.toLowerCase();
  const base = new URL(baseUrl);
  base.hash = "";
  const baseKey = base.toString();
  const origin = base.origin;

  const internalLinks: string[] = [];
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("mailto:") || href.toLowerCase().startsWith("tel:")) return;
    try {
      const abs = new URL(href, baseUrl);
      abs.hash = "";
      if (abs.origin !== origin) return;
      if (abs.toString() === baseKey) return; // קישור של העמוד לעצמו
      if (ASSET_EXT_RE.test(abs.pathname)) return;
      internalLinks.push(abs.toString());
    } catch {
      // href לא תקין - מתעלמים
    }
  });

  let hasContactForm = false;
  $("form").each((_i, el) => {
    const $f = $(el);
    const attrs = [$f.attr("role"), $f.attr("class"), $f.attr("id"), $f.attr("action")]
      .join(" ")
      .toLowerCase();
    if (NON_CONTACT_FORM_RE.test(attrs)) return;
    // טופס יצירת קשר: יש textarea, או לפחות שני שדות אמיתיים (תיבת חיפוש = שדה אחד)
    if ($f.find("textarea").length > 0) {
      hasContactForm = true;
      return;
    }
    const realFields = $f.find(
      "input:not([type=submit]):not([type=button]):not([type=hidden]):not([type=image]), select",
    ).length;
    if (realFields >= 2) hasContactForm = true;
  });

  // בוני טפסים מודרניים (Elementor ודומיו) מרנדרים שדות בלי תגית form עוטפת - שליחה ב-JS.
  // המקרה החי: עמוד צור-קשר עם textarea ושדות אמיתיים ואפס תגיות form קיבל "אין טופס".
  // fallback שמרני: תיבת הודעה + שדה email/tel מחוץ לכל form = טופס יצירת קשר
  if (!hasContactForm) {
    const looseTextarea = $("textarea").filter((_i, el) => $(el).closest("form").length === 0).length;
    const looseContactInput = $('input[type=email i], input[type=tel i]').filter(
      (_i, el) => $(el).closest("form").length === 0,
    ).length;
    if (looseTextarea > 0 && looseContactInput > 0) hasContactForm = true;
  }

  let platform: string | undefined;
  if (lowerHtml.includes("wp-content") || lowerHtml.includes("wp-includes")) platform = "wordpress";
  else if (lowerHtml.includes("wixstatic.com") || lowerHtml.includes("wix.com")) platform = "wix";
  else if (lowerHtml.includes("cdn.shopify.com")) platform = "shopify";

  // הצהרת נגישות: עוגן שהטקסט שלו מכיל "נגישות", או שה-href שלו (אחרי פענוח הנתיב) מפנה לעמוד
  // הצהרה. סלחני לכישלון פענוח בשתי רמות - URL לא תקין בכלל, או % לא תקין בתוך נתיב תקין
  let hasAccessibilityStatement = false;
  $("a[href]").each((_i, el) => {
    if (hasAccessibilityStatement) return;
    const $a = $(el);
    if (A11Y_STATEMENT_TEXT_RE.test($a.text())) {
      hasAccessibilityStatement = true;
      return;
    }
    const href = $a.attr("href") ?? "";
    let pathname = href;
    try {
      const u = new URL(href, baseUrl);
      try {
        pathname = decodeURIComponent(u.pathname);
      } catch {
        pathname = u.pathname; // % לא תקין בפענוח - בודקים את הנתיב הגולמי
      }
    } catch {
      // href לא בר-פענוח כלל כ-URL (גם לא יחסית ל-base) - בודקים את המחרוזת הגולמית שלו
    }
    if (A11Y_STATEMENT_HREF_RE.test(pathname)) hasAccessibilityStatement = true;
  });

  return {
    hasContactForm,
    hasWhatsappLink: WHATSAPP_RE.test(lowerHtml),
    hasPhoneLink: $('a[href^="tel:" i]').length > 0,
    hasEmailLink: $('a[href^="mailto:" i]').length > 0,
    hasOnlineBooking: BOOKING_RE.test(lowerHtml),
    hasChatWidget: CHAT_RE.test(lowerHtml) || CUSTOM_CHAT_RE.test(lowerHtml),
    hasFacebookPixel: FB_PIXEL_RE.test(lowerHtml),
    hasGoogleAnalytics: GA_RE.test(lowerHtml),
    hasAccessibilityStatement,
    hasAccessibilityWidget: A11Y_WIDGET_RE.test(lowerHtml),
    platform,
    clientFramework: detectClientFramework(html),
    internalLinks: [...new Set(internalLinks)],
  };
}
