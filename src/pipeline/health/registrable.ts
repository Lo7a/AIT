// הדומיין שאפשר לרשום בפועל, מתוך שם מארח מלא.
//
// למה זה קריטי ולא ניתן לוותר עליו: בדיקות דומיין ודואר חייבות לרוץ על הדומיין של
// העסק, לא על הדומיין של הפלטפורמה שהוא יושב עליה. עסק שהאתר שלו mybiz.wixsite.com
// יקבל אחרת דוח על תקינות הדואר של Wix בתור שלו - טענה שגויה לחלוטין על עסק אמיתי,
// בדיוק מה שכלל הכנות אוסר. במקרה הזה אין דומיין של העסק בכלל, והתשובה חייבת להיות
// null כדי שהבדיקות ידווחו "לא נבדק".
//
// בישראל הסיומת היא בדרך כלל שתי רמות (co.il), ולכן חיתוך נאיבי של שתי התוויות
// האחרונות היה מחזיר "co.il" עצמו.

// סיומות דו-רמתיות שרלוונטיות לעסקים ישראלים ולסיומות נפוצות אחרות שהם מחזיקים
const MULTI_LABEL_SUFFIXES: readonly string[] = [
  "co.il", "org.il", "net.il", "ac.il", "gov.il", "muni.il", "k12.il", "idf.il",
  "co.uk", "org.uk", "com.au", "co.nz", "com.br", "co.za",
];

// פלטפורמות שמארחות אתרים על תת-דומיין שלהן. שם מארח כזה אינו דומיין של העסק,
// והרשומות שיימצאו עליו הן של הפלטפורמה. מוחזר null בכוונה
const PLATFORM_HOSTS: readonly string[] = [
  "wixsite.com", "editorx.io", "myshopify.com", "squarespace.com", "weebly.com",
  "wordpress.com", "blogspot.com", "webflow.io", "netlify.app", "vercel.app",
  "github.io", "business.site", "mystrikingly.com", "tilda.ws", "ecwid.com",
  "web.app", "firebaseapp.com", "pages.dev", "cargo.site", "site123.me",
];

/** מנקה שם מארח: הורדת פרוטוקול, פורט, נתיב, נקודה סופית ואותיות גדולות */
export function normalizeHostname(input: string): string | null {
  const raw = input.trim();
  if (raw.length === 0) return null;
  let host = raw;
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  host = host.split("/")[0].split("@").pop() ?? "";
  host = host.split(":")[0];
  host = host.replace(/\.+$/, "").toLowerCase();
  if (host.length === 0 || !host.includes(".")) return null;
  // כתובת IP אינה דומיין שאפשר לרשום
  if (/^[\d.]+$/.test(host)) return null;
  return host;
}

/**
 * הדומיין הרשום, או null כשאין כזה שאפשר לייחס לעסק.
 * null מוחזר גם עבור אתר שיושב על פלטפורמה - וזה תמיד יוביל ל"לא נבדק", לא ל"אין".
 */
export function registrableDomain(input: string): string | null {
  const host = normalizeHostname(input);
  if (host == null) return null;

  const bare = host.startsWith("www.") ? host.slice(4) : host;

  // אתר על פלטפורמה: אין לעסק דומיין משלו, ואסור לבדוק את זה של הפלטפורמה
  for (const platform of PLATFORM_HOSTS) {
    if (bare === platform || bare.endsWith(`.${platform}`)) return null;
  }

  const labels = bare.split(".");
  for (const suffix of MULTI_LABEL_SUFFIXES) {
    const parts = suffix.split(".").length;
    if (bare.endsWith(`.${suffix}`) && labels.length >= parts + 1) {
      return labels.slice(-(parts + 1)).join(".");
    }
  }

  if (labels.length < 2) return null;
  return labels.slice(-2).join(".");
}
