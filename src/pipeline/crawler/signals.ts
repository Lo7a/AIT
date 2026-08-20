import * as cheerio from "cheerio";
import type { WebsiteSignals } from "../types";

// סיגנלים של עמוד בודד; ה-crawler ממזג אותם לרמת האתר (WebsiteSignals)
// jsRendered מוחרג - הוא נגזר ברמת האתר (crawl.ts) מהעמוד הראשי, extractSignals לא קובע אותו.
// hasAccessibilityStatement/hasAccessibilityWidget: אופציונליים ב-WebsiteSignals (כדי לא לשבור
// fixtures ישנים בבדיקות), אבל כאן חובה - extractSignals תמיד מחשבת ערך אמיתי, ובלי הדריסה הזו
// הלולאה הגנרית ב-crawl.ts (merged[key] = merged[key] || signals[key]) לא הייתה מתקמפלת (TS לא
// מרשה כתיבה גנרית דרך מפתחות ששייכים ל-boolean|undefined לצד boolean רגיל)
export interface PageSignals
  extends Omit<
    WebsiteSignals,
    | "pagesCrawled" | "crawledUrls" | "jsRendered"
    | "hasAccessibilityStatement" | "hasAccessibilityWidget"
    | "hasOrderingSystem" | "hasDeliveryPlatform" | "hasLinkShortener"
  > {
  internalLinks: string[];
  hasAccessibilityStatement: boolean;
  hasAccessibilityWidget: boolean;
  hasOrderingSystem: boolean;
  hasDeliveryPlatform: boolean;
  hasLinkShortener: boolean;
}

// זיהוי לפי דומיינים/קבצים של ספקים - לא לפי מילים בטקסט חופשי, כדי למנוע התרעות שווא
const WHATSAPP_RE = /wa\.me\/|(?:api|web)\.whatsapp\.com|whatsapp:\/\/send/;
// מקצרי כתובות: קישור מקוצר מסתיר את היעד, ולכן שלילה של וואטסאפ הופכת ל"לא נבדק" במקום לפער.
// המקרה החי (habarber.co.il): כפתור וואטסאפ בולט שמקשר דרך bit.ly - אף אחת מתבניות WHATSAPP_RE
// לא מופיעה ב-HTML, והעסק קיבל פער מלא בביטחון על ערוץ שיש לו
const SHORTENER_RE = /bit\.ly\/|tinyurl\.com\/|cutt\.ly\/|t\.co\/|goo\.gl\/|is\.gd\/|rb\.gy\//;
// קביעת תור אונליין: מערכות תורים והזמנת מקומות. מחקר 20.8 מיפה את השוק הישראלי (23 מערכות) -
// עד אז הזיהוי היה בינלאומי כמעט לגמרי, והמערכות שהקטלוג שלנו עצמו מתמחר לא זוהו כלל.
// calmark אומת חי (habarber.co.il); השאר דומייני בית של הספק, שנתפסים ב-href כי כך המערכות
// הישראליות עובדות - קישור לדף הזמנה ייעודי ולא סקריפט מוטמע.
// לא נכללו במכוון: (א) מערכות ניהול מרפאה (tiffulit/smilecloud/medform/doctor-clinix/shidurit) -
// חלקן בונות גם את האתר עצמו, ולכן נוכחות הדומיין אינה מעידה על קביעת תור; (ב) barber7 - ייתכן
// שזו מספרה בודדת עם אפליקציה משלה ולא ספק. שתיהן ממתינות לאימות חי, כי חיובי שגוי בחוק של
// 30 נקודות גרוע מהחמצה
const BOOKING_RE = /calendly|vcita|setmore|simplybook|booking-calendar|bookly|amelia[-a-z]*booking|appointment-booking|myvisit|easytable|tabit|ontopo|clickynder|plannie\.co\.il|mytor\.co\.il|yoman\.co\.il|tor4you|easybizy|lumasystem|nello\.co\.il|torli\.net|simpletor|easyweek|shift\.co\.il|zmantov|more-than\.co\.il|calmark|kwazu|fizikal|arbox\.co\.il/;
// הזמנת אוכל ישירה מהעסק (תפריט/הזמנות משלו) - נפרד מקביעת תור, אבל עדיין ערוץ ישיר שבבעלותו.
// mealy אומת חי (caramelcafe.co.il). התבנית order\. תופסת סאב-דומיין הזמנות גנרי של ספק
// (המקרה החי המקורי: פיצרייה עם order.bitetech.co.il שקיבלה "אין הזמנה אונליין")
const ORDERING_RE = /bitetech|mealy\.co\.il|order\.[a-z0-9-]+\.(?:co\.il|com|il)/;
// פלטפורמות משלוחים של צד שלישי - הופרדו מ-BOOKING_RE ב-20.8. משלוח דרך וולט אינו ערוץ ישיר
// של העסק אלא ההפך: זו הראיה לתלות בעמלה של 25 עד 33 אחוז (מחקר המסעדות). לכן הן לא מזכות
// בחוק online_booking, והן אות עצמאי שמזין את ההמלצה על הזמנות ישירות
const DELIVERY_RE = /wolt\.com|tenbis|10bis\.co\.il|mishloha/;
// קביעת תור במערכת עצמית (בלי ספק מזוהה): רק עוגן או כפתור שהטקסט שלו מבקש לקבוע תור וה-href
// שלו מוביל לעמוד אמיתי. המלכודת שהתבנית הזו נבנתה סביבה: "לקביעת תור התקשרו 03-..." הוא נפוץ
// מאוד באתרים ישראליים - זו קביעת תור בטלפון, ההפך הגמור. לכן href של tel:/mailto: נפסל,
// וטקסט חופשי בלי עוגן כלל אינו נספר
const BOOKING_ANCHOR_TEXT_RE = /(?:ל?קביעת|לקבוע|קבע[יו]?|להזמנת|הזמנת|לזימון|זימון)\s+תור|book\s+(?:now|online|appointment)|schedule\s+(?:an\s+)?appointment/i;
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
// zap.dbusiness.co נוסף 20.8 אחרי אימות חי (gal-garage.co.il) - וידג'ט נגישות ישראלי שלא היה ברשימה
const A11Y_WIDGET_RE = /userway|equalweb|accessibe|acsbapp|nagich|enable\.co\.il|accessible-poetry|accessiway|negishim|dbusiness\.co/;
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

// כתובות מקוצרות שמופיעות כ-href בעמוד - הקלט לפתרון הקישורים ב-crawl.ts. פונקציה טהורה:
// היא רק אוספת, לא פותרת. מוגבלת ל-href של עוגן, כי רק הוא יעד שהמשתמש יכול ללחוץ עליו
export function collectShortenerLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const found: string[] = [];
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (!href || !SHORTENER_RE.test(href)) return;
    try {
      found.push(new URL(href, baseUrl).toString());
    } catch {
      // href לא תקין - מתעלמים
    }
  });
  return [...new Set(found)];
}

// אותות שאפשר להסיק מכתובות בלבד, בלי HTML. משמש את crawl.ts אחרי פתרון קישורים מקוצרים:
// היעד האמיתי של הקישור נבדק מול אותן טביעות אצבע בדיוק שהעמוד עצמו נבדק מולן
export function signalsFromUrls(urls: string[]): {
  hasWhatsappLink: boolean;
  hasOnlineBooking: boolean;
  hasOrderingSystem: boolean;
  hasDeliveryPlatform: boolean;
} {
  const joined = urls.join(" ").toLowerCase();
  return {
    hasWhatsappLink: WHATSAPP_RE.test(joined),
    hasOnlineBooking: BOOKING_RE.test(joined),
    hasOrderingSystem: ORDERING_RE.test(joined),
    hasDeliveryPlatform: DELIVERY_RE.test(joined),
  };
}

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

  // מערכת תורים עצמית: עסק שבנה לעצמו אין לו דומיין ספק שאפשר לזהות. שני אותות מבניים,
  // ושניהם מחמירים בכוונה (ראו ההערה על BOOKING_ANCHOR_TEXT_RE):
  // 1. עוגן/כפתור שמבקש לקבוע תור וה-href שלו הוא עמוד אמיתי - לא tel:, לא mailto:, לא בלי href
  // 2. טופס שיש בו גם שדה תאריך וגם שדה שעה - צירוף שקשה לייצר בטעות
  let hasCustomBooking = false;
  $("a[href], button").each((_i, el) => {
    if (hasCustomBooking) return;
    const $el = $(el);
    if (!BOOKING_ANCHOR_TEXT_RE.test($el.text())) return;
    const href = $el.attr("href");
    if (href === undefined) return; // <button> בלי קישור - לא מעיד על יעד קיים
    const scheme = href.trim().toLowerCase();
    if (scheme.startsWith("tel:") || scheme.startsWith("mailto:")) return; // קביעת תור בטלפון
    if (scheme.startsWith("javascript:") || scheme === "#" || scheme === "") return;
    hasCustomBooking = true;
  });
  if (!hasCustomBooking) {
    $("form").each((_i, el) => {
      if (hasCustomBooking) return;
      const $f = $(el);
      if ($f.find("input[type=date i]").length > 0 && $f.find("input[type=time i]").length > 0) {
        hasCustomBooking = true;
      }
    });
  }

  return {
    hasContactForm,
    hasWhatsappLink: WHATSAPP_RE.test(lowerHtml),
    hasPhoneLink: $('a[href^="tel:" i]').length > 0,
    hasEmailLink: $('a[href^="mailto:" i]').length > 0,
    hasOnlineBooking: BOOKING_RE.test(lowerHtml) || hasCustomBooking,
    hasOrderingSystem: ORDERING_RE.test(lowerHtml),
    hasDeliveryPlatform: DELIVERY_RE.test(lowerHtml),
    hasLinkShortener: SHORTENER_RE.test(lowerHtml),
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
