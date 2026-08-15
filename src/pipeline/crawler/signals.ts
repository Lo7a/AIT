import * as cheerio from "cheerio";
import type { WebsiteSignals } from "../types";

// סיגנלים של עמוד בודד; ה-crawler ממזג אותם לרמת האתר (WebsiteSignals)
// jsRendered מוחרג — הוא נגזר ברמת האתר (crawl.ts) מהעמוד הראשי, extractSignals לא קובע אותו
export interface PageSignals extends Omit<WebsiteSignals, "pagesCrawled" | "crawledUrls" | "jsRendered"> {
  internalLinks: string[];
}

// זיהוי לפי דומיינים/קבצים של ספקים — לא לפי מילים בטקסט חופשי, כדי למנוע התרעות שווא
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
// טפסים שאינם יצירת קשר: חיפוש, ניוזלטר, התחברות, עגלה, תגובות בלוג
const NON_CONTACT_FORM_RE = /(?:^|[^a-z])(search|newsletter|subscribe|mc4wp|login|register|cart|coupon|comment)/;
// קישורים לקבצים — לא עמודים, לא נכנסים לתור הסריקה
const ASSET_EXT_RE = /\.(jpe?g|png|gif|webp|svg|avif|pdf|docx?|xlsx?|pptx?|zip|rar|mp4|mp3|csv)$/i;

// פונקציה טהורה: HTML פנימה, סיגנלים החוצה. בלי רשת, בלי מצב.
// baseUrl = כתובת העמוד הזה עצמו — משמשת לפתרון קישורים יחסיים ולבדיקת same-origin
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
      // href לא תקין — מתעלמים
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

  return {
    hasContactForm,
    hasWhatsappLink: WHATSAPP_RE.test(lowerHtml),
    hasPhoneLink: $('a[href^="tel:" i]').length > 0,
    hasEmailLink: $('a[href^="mailto:" i]').length > 0,
    hasOnlineBooking: BOOKING_RE.test(lowerHtml),
    hasChatWidget: CHAT_RE.test(lowerHtml) || CUSTOM_CHAT_RE.test(lowerHtml),
    hasFacebookPixel: FB_PIXEL_RE.test(lowerHtml),
    hasGoogleAnalytics: GA_RE.test(lowerHtml),
    platform,
    internalLinks: [...new Set(internalLinks)],
  };
}
