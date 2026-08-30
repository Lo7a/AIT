import type { ScanFindings } from "../types";
import type { DimensionDef, RuleDef } from "./types";
import { noGbp, crawlUsable, reviewsAnalyzed } from "../evidence";
import { SOCIAL_PLATFORM_LABEL_HE, socialPresenceOf } from "../social-hosts";
import type { BusinessModel, ModelSection } from "../model/business-model";
import { probeVerdict, probeFactLine } from "../mystery/evidence";

// עזר "ידוע" מקומי לממד הזה בלבד - לא משותף (רק accessibility צריך אותו)
const phoneFound = (f: ScanFindings) => !!f.business.phone || !!f.websiteSignals?.hasPhoneLink;

// אות שלילי שמקורו ב-crawl (contact_form/online_booking/chat_widget - התכונה שהם בודקים
// מרונדרת ב-JS לעתים): "לא נמצא" אמין רק כשה-crawl שמיש וגם לא זוהתה תשתית קליינט (Vue/React/
// Angular). המקרה החי: edrieng.co.il - אתר Vue, טופס יצירת קשר אמיתי קיים אך מרונדר בצד לקוח,
// ה-HTML הגולמי לא מכיל אף <form>/<input>. "אין טופס יצירת קשר" הייתה הגזמה - פשוט לא ראינו.
// גילוי חיובי (signal=true) תמיד ידוע, גם עם clientFramework - עדות שנמצאה בשרת אמינה בכל מקרה.
// whatsapp/phone_available/email_link לא עוברים דרך העזר הזה בכוונה - הקישורים האלה בקליפה
// (shell), לא בתוכן הדינמי, אז "לא נמצא" עדיין אמין גם באתר SPA
const knownCrawlNegative = (f: ScanFindings, signal: boolean | undefined): boolean => {
  if (signal) return true;
  if (f.websiteSignals?.clientFramework) return false;
  return crawlUsable(f);
};
// נשאר באתר קישור מקוצר שלא הצלחנו לפתוח, ולכן היעד שלו לא ידוע. כל חוק שהראיה שלו היא
// קישור יוצא חייב להתייחס לזה: "לא נמצא" מול יעד מוסתר אינו ידיעה אלא ניחוש.
// שני המקרים החיים שהולידו את זה היו בדיוק כאלה - habarber.co.il (וואטסאפ מאחורי bit.ly)
// ו-jems.co.il (קישור הזמנה מאחורי did.li)
const hiddenLinkTarget = (f: ScanFindings): boolean => f.websiteSignals?.hasLinkShortener === true;
// ערוץ הזמנה ישיר שבבעלות העסק: קביעת תור או מערכת הזמנות משלו. משמש גם ב-known וגם
// ב-earned, כדי ששני הצדדים לא יתפצלו בתיקון הבא
const bookingFound = (f: ScanFindings): boolean =>
  !!f.websiteSignals?.hasOnlineBooking || !!f.websiteSignals?.hasOrderingSystem;
// הגדרת אימות הדואר כממצא אחד: מחזיר את הבעיה החמורה ביותר שנמצאה, null כשהכול תקין,
// ו-undefined כשאין די מידע כדי לקבוע. שלושת המצבים מכוונים - שבח דורש לדעת ששני החלקים
// תקינים, ופער דורש בעיה שבאמת נצפתה; מידע חלקי בלי בעיה נשאר "לא נבדק" ולא הופך לשבח.
// סדר העדיפות: התנגשות לפני היעדר, כי היא שוברת הגדרה שכבר קיימת וזה תיקון דחוף יותר
// (ראו dns-mail.ts - ריבוי רשומות מבטל את הבדיקה בשני התקנים)
const mailAuthGap = (f: ScanFindings): string | null | undefined => {
  const mail = f.health?.mail;
  if (mail == null) return undefined;
  if (mail.spfConflict === true) {
    return "לדומיין יש יותר מרשומת SPF אחת. לפי התקן זה מבטל את הבדיקה כולה ולא מחזק אותה, ודואר שאתם שולחים עלול ליפול לספאם - צריך לאחד אותן לרשומה אחת";
  }
  if (mail.dmarcConflict === true) {
    return "לדומיין יש יותר מרשומת DMARC אחת, ולפי התקן שרתי הדואר מתעלמים מכולן - צריך לאחד אותן לרשומה אחת";
  }
  if (mail.hasSpf === false) {
    return "אין רשומת SPF לדומיין - לא הגדרתם לשרתי הדואר בעולם מי מורשה לשלוח דואר בשם העסק";
  }
  // בלי טענה שהדואר נופל: היעדר DMARC אינו כשל מסירה, הוא היעדר הגנה מפני התחזות
  if (mail.hasDmarc === false) {
    return "אין רשומת DMARC לדומיין - לא פרסמתם לשרתי הדואר מה לעשות עם הודעות שמתחזות לכתובת שלכם";
  }
  if (mail.hasSpf === true && mail.hasDmarc === true) return null;
  return undefined;
};

// "חוזרת" = עולה יותר מפעם אחת במדגם שנבדק, לא כל תמה שצוינה
const recurringProblems = (f: ScanFindings) =>
  (f.reviewInsights?.problemThemes ?? []).filter((t) => t.count >= 2);

const sec = (ms?: number) => ((ms ?? 0) / 1000).toFixed(1);

// נתוני שדה (CrUX): מה שגולשים אמיתיים חוו בפועל, מול ה-lab שהוא ריצה מדומה יחידה ורועשת.
// היעדר נתון שדה אינו ממצא ואינו מפעיל שום חוק - הוא רק אומר שלגוגל אין די תנועה למדידה
const fieldLcp = (f: ScanFindings) => f.pageSpeed?.field?.lcpMs;
// "מהיר" נקבע לפי הקטגוריה הכוללת; אם גוגל לא נתנה כוללת, קטגוריית ה-LCP היא הקירוב הטוב ביותר
const fieldFast = (f: ScanFindings) => {
  const field = f.pageSpeed?.field;
  if (field == null) return false;
  return field.overall === "FAST" || (field.overall == null && field.lcpCategory === "FAST");
};

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

// ------- ממד "בשלות תהליכים" (אבן דרך 4, משימה 1): נגזר ממודל העסק (הראיון), לא מ-ScanFindings -------
// RuleDef.known/earned/gapText/okText מקבלים רק ScanFindings (חוזה המנוע לא השתנה) - חוקי
// process סוגרים על model דרך processRules(model) ומתעלמים מהפרמטר שהם כן מקבלים
//
// סקירת קוד (סבב 2): הגרסה הראשונה של lead_handling/manual_tasks קראה שדה בודד בשם קבוע
// (whoHandles/manualTasks) והתייחסה להיעדרו כעובדה חיובית - אבל extract.ts נותן ל-LLM שם שדה
// חופשי (וה-fallback שומר ownerNotes בכלל), אז תשובה אמיתית עם תלונה מפורשת יכלה "להיעלם"
// (שדה בשם אחר) ולקבל שבח בטעות. התיקון: כל שלושת החוקים קוראים את כל הטקסט המדווח בסקציה
// (reportedText, אותה גישה כמו internal_tools כבר עשה) ומחפשים מילות מפתח - לא שם שדה קבוע

const sectionCredit = (model: BusinessModel | null, section: ModelSection): number => model?.credits[section] ?? 0;

const modelStr = (model: BusinessModel | null, section: ModelSection, field: string): string => {
  const v = model?.data[section]?.[field];
  return typeof v === "string" ? v.trim() : "";
};

const QUOTE_TRUNCATE_LEN = 80;
const truncateQuote = (s: string): string => (s.length > QUOTE_TRUNCATE_LEN ? `${s.slice(0, QUOTE_TRUNCATE_LEN).trim()}...` : s);

// מצטט חלון סביב ההתאמה הראשונה של re בתוך text (לא תמיד תחילת הטקסט) - כדי שהציטוט בפער
// יכיל בפועל את מילת המפתח שהובילה לפער, גם כשהיא לא בהתחלה
const quoteMatch = (text: string, re: RegExp): string => {
  const m = re.exec(text);
  if (!m) return truncateQuote(text);
  const half = Math.floor(QUOTE_TRUNCATE_LEN / 2);
  const start = Math.max(0, m.index - half);
  const end = Math.min(text.length, start + QUOTE_TRUNCATE_LEN);
  const clipped = text.slice(start, end).trim();
  return `${start > 0 ? "..." : ""}${clipped}${end < text.length ? "..." : ""}`;
};

// שדות שמקורם בסריקה (deriveBusinessModel), לא בדיווח בעל העסק - לא נכנסים לטקסט המדווח.
// הערה: hasContactForm (lead_flow) הוא boolean ולכן כבר מסונן על ידי typeof v === "string" למטה;
// רשום כאן בפירוש בכל זאת כדי שהכוונה תהיה גלויה גם אם שדה עתידי מאותו מקור יהיה string
const SCAN_DERIVED_KEYS: Partial<Record<ModelSection, readonly string[]>> = {
  lead_flow: ["hasContactForm"],
  tools: ["platform", "detected"],
};

// כל הטקסט שדווח בסקציה (כל הערכים המחרוזתיים, מעבר לשדות שמקורם בסריקה) - שם השדה שה-LLM בוחר
// בזמן החילוץ חופשי (כמו billing.invoiceTool בראיון האמיתי, וה-fallback שומר ownerNotes), אז
// סורקים את כל הערכים המדווחים במקום להסתמך על שם שדה קבוע אחד (סקירת קוד, ראו למעלה)
const reportedText = (model: BusinessModel | null, section: ModelSection): string => {
  const data = model?.data[section] ?? {};
  const excluded = SCAN_DERIVED_KEYS[section] ?? [];
  return Object.entries(data)
    .filter(([k, v]) => !excluded.includes(k) && typeof v === "string")
    .map(([, v]) => v as string)
    .filter((s) => s.length > 0)
    .join(" ");
};

// מילות מפתח לנפילת פניות - מופיעות בטקסט המדווח בכל שם שדה (לא רק leadDrop). מיוצא כדי
// שבדיקות על ניסוח אפשרויות הבחירה המרובה בבנק השאלות (questions.ts) יוכלו להצליב מול הרג'קס
// עצמו ולא רק לצטט אותו - ראו interview-questions.test.ts
export const LEAD_DROP_RE = /מתפספס|מתפספסת|מתפספסים|נופל|נופלת|נופלות|נופלים|הולך לאיבוד|הולכת לאיבוד|הולכים לאיבוד|הולכות לאיבוד|לא חוזרים|לא חוזרות|מפספס|מפספסת|מפספסים/i;

// "אין עבודה ידנית" מפורש - שלילה מפורשת, לא רק היעדר טקסט
const NO_MANUAL_TASKS_RE = /אין משימות ידניות|אין עבודה ידנית|אין עבודה ידנית חוזרת|הכל אוטומטי|הכל אוטומטית|בלי עבודה ידנית|בלי משימות ידניות/i;

// זיהוי "כלי ניהול מעבר לחשבוניות" (CRM/יומן מנוהל) - מילות מפתח קבועות וגלויות, לא LLM (אותו
// עיקרון כמו socialPresenceOf למעלה). היוריסטיקה גלויה ומתועדת - פספוס (gap כשבאמת יש כלי בשם
// לא-מוכר) קביל, היפוך (earned כשבפועל אין) לא - לכן הרשימה השחורה רחבה מהרשימה הלבנה בכוונה:
// "לא משתמשים"/"ביטלנו"/"בעתיד"/"חשבנו ל"/"אין לנו" שוללים גם כשהמילה CRM כן מופיעה בתשובה,
// ו"אין CRM, אקסל" לא נספר בטעות כהוכחה לכלי ניהול
const HAS_MANAGEMENT_TOOL_RE = /CRM|יומן מנוהל|מערכת ניהול|תוכנת ניהול|ניהול לקוחות|monday|מאנדיי|priority|פריוריטי|zoho|זוהו|hubspot|האבספוט|salesforce|סיילספורס/i;
const NO_MANAGEMENT_TOOL_RE = /אין CRM|בלי CRM|לא CRM|רק אקסל|אקסל בלבד|בלי מערכת ניהול|אין מערכת ניהול|לא משתמשים|ביטלנו|בעתיד|חשבנו ל|אין לנו/i;

const GENERIC_LEAD_OK = "הטיפול בפניות מסודר, אין סימני נפילה בתשובות שנאספו";

export function processRules(model: BusinessModel | null): RuleDef[] {
  return [
    {
      key: "lead_handling", points: 40,
      // הלקוח הסמוי (משימה 10, 30.8) גובר על הדיווח העצמי: פנייה שנמדדה היא עובדה, מה שסופר
      // בראיון הוא סיפור. בלי בדיקה - הכלל על טקסט הראיון נשאר בדיוק כמו שהיה
      known: (f) => probeVerdict(f) !== "none" || sectionCredit(model, "lead_flow") >= 1,
      earned: (f) => {
        const verdict = probeVerdict(f);
        if (verdict !== "none") return verdict === "answered_fast";
        const text = reportedText(model, "lead_flow");
        return text.length > 0 && !LEAD_DROP_RE.test(text);
      },
      gapText: (f) => {
        const fact = probeFactLine(f);
        if (fact != null) return fact;
        const text = reportedText(model, "lead_flow");
        return LEAD_DROP_RE.test(text)
          ? `פניות נופלות: ${quoteMatch(text, LEAD_DROP_RE)}`
          : "אין תמונה מסודרת על מי מטפל בפניות ותוך כמה זמן, פניות עלולות ליפול בין הכיסאות";
      },
      // whoHandles/responseTime משמשים כאן לניסוח בלבד (לא לקביעת earned/known) - כשהם לא
      // קיימים בשם הזה בדיוק (LLM בחר שם אחר) חוזרים לניסוח כללי במקום להרכיב משפט שבור
      okText: (f) => {
        const fact = probeFactLine(f);
        if (fact != null) return fact;
        const who = modelStr(model, "lead_flow", "whoHandles");
        const responseTime = modelStr(model, "lead_flow", "responseTime");
        if (who.length === 0 && responseTime.length === 0) return GENERIC_LEAD_OK;
        if (who.length > 0 && responseTime.length > 0) {
          return `הטיפול בפניות מסודר - ${truncateQuote(who)}. זמן תגובה: ${truncateQuote(responseTime)}`;
        }
        if (who.length > 0) return `הטיפול בפניות מסודר - ${truncateQuote(who)}`;
        return `הטיפול בפניות מסודר, זמן תגובה: ${truncateQuote(responseTime)}`;
      },
    },
    {
      key: "manual_tasks", points: 30,
      known: () => sectionCredit(model, "manual_tasks") >= 1,
      // אין טקסט מדווח בכלל, או שלילה מפורשת ("אין עבודה ידנית") - שתי הדרכים היחידות ל-earned;
      // כל טקסט אחר (כולל fallback ownerNotes) הוא תיאור בפועל של עבודה ידנית = פער
      earned: () => {
        const text = reportedText(model, "manual_tasks");
        return text.length === 0 || NO_MANUAL_TASKS_RE.test(text);
      },
      gapText: () => `יש עדיין עבודה ידנית חוזרת: ${truncateQuote(reportedText(model, "manual_tasks"))}`,
      okText: () => "מעט עבודה ידנית חוזרת, רוב התהליכים כבר לא נשענים על הקלדה ידנית",
    },
    {
      key: "internal_tools", points: 30,
      known: () => sectionCredit(model, "tools") >= 1,
      earned: () => {
        const text = reportedText(model, "tools");
        return HAS_MANAGEMENT_TOOL_RE.test(text) && !NO_MANAGEMENT_TOOL_RE.test(text);
      },
      gapText: () => {
        const text = reportedText(model, "tools");
        return text.length > 0
          ? `הניהול הפנימי נשען על כלים בסיסיים: ${truncateQuote(text)}`
          : "אין מערכת ניהול פנימית (CRM/יומן מנוהל) מעבר לחשבוניות";
      },
      okText: () => `יש כלי ניהול פנימי מעבר לחשבוניות: ${truncateQuote(reportedText(model, "tools"))}`,
    },
  ];
}

export const DIMENSIONS: DimensionDef[] = [
  {
    key: "visibility", label: "נראות דיגיטלית", weight: 0.2,
    rules: [
      {
        key: "gbp_exists", points: 20,
        // זהות Places היא תנאי הידיעה, לא רק הזכייה (הכרעת מייסד 21.8): דגל no_gbp מוצב באופן
        // גורף בכל אבחון אתר-בלבד (scan-website.ts) בלי אף קריאת Places - גם כשהמשתמש רק דחה
        // התאמה שגויה. המקרה החי: התאחדות התעשיינים - חיפוש ה-URL החזיר עסק אחר לגמרי (הספקית
        // שבנתה את האתר), והדוח הכריז "העסק לא קיים במפות גוגל" כפער של 20 נקודות בלי שבדקנו.
        // אין היום שום מסלול שקובע ביודעין שהעסק אינו במפות (no_gbp נכתב רק ב-scanWebsiteOnly),
        // ולכן בלי זהות החוק "לא נבדק"; עם זהות הוא מושג תמיד - היא עצמה ההוכחה שהעסק בגוגל,
        // ו-earned נבחן רק כאשר known (חוזה המנוע). gapText נשמר למסלול אימות עתידי שכן יקבע
        // היעדר ביודעין - היום הוא לא נקרא
        known: (f) => !noGbp(f), earned: () => true,
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
        key: "perf", points: 16,
        known: (f) => f.pageSpeed?.performanceScore != null || fieldFast(f),
        // מדידת גולשים אמיתיים גוברת על ציון המעבדה. ציון ה-lab אינו שקר - הוא מדידה
        // אמיתית של ריצה מדומה אחת - אבל הוא לא מה שהלקוחות של העסק חווים, והצגתו כפער
        // מול מדידת שדה שאומרת ההפך היא האשמת שווא. נמדד על אתרים ישראליים אמיתיים
        earned: (f) => fieldFast(f) || (f.pageSpeed?.performanceScore ?? 0) >= 70,
        gapText: (f) => `ציון ביצועי מובייל ${f.pageSpeed?.performanceScore}/100 - מתחת ליעד של 70, מבקרים במובייל נוטים לנטוש`,
        okText: (f) => (fieldFast(f)
          ? "האתר נטען מהר אצל המבקרים בפועל, לפי מדידות של גוגל על גולשים אמיתיים"
          : `ביצועי מובייל טובים (${f.pageSpeed?.performanceScore}/100)`),
      },
      {
        key: "lcp", points: 12,
        known: (f) => fieldLcp(f) != null || f.pageSpeed?.lcpMs != null,
        // יש מדידת שדה - היא הקובעת, כי היא אחוזון 75 של מבקרים אמיתיים ולא ריצה בודדת
        earned: (f) => (fieldLcp(f) ?? f.pageSpeed?.lcpMs ?? Infinity) <= 4000,
        gapText: (f) => (fieldLcp(f) != null
          ? `אצל 75 אחוז מהמבקרים באתר העמוד נטען ${sec(fieldLcp(f))} שניות, מעל היעד של 4 שניות`
          : `העמוד הראשי נטען ${sec(f.pageSpeed?.lcpMs)} שניות, מעל היעד של 4 שניות`),
        okText: (f) => (fieldLcp(f) != null
          ? `זמן טעינה תקין אצל המבקרים בפועל (${sec(fieldLcp(f))} שניות אצל 75 אחוז מהם)`
          : `זמן טעינה תקין (${sec(f.pageSpeed?.lcpMs)} שניות)`),
      },
      {
        key: "seo", points: 8,
        known: (f) => f.pageSpeed?.seoScore != null,
        earned: (f) => (f.pageSpeed?.seoScore ?? 0) >= 90,
        gapText: (f) => `ציון SEO ${f.pageSpeed?.seoScore}/100, יש כשלים בסיסיים באופטימיזציה למנועי חיפוש`,
        okText: (f) => `בסיס SEO תקין (${f.pageSpeed?.seoScore}/100)`,
      },
      {
        // סימון schema.org של עסק מקומי. אותו כלל כמו לכל אות שלילי מה-crawl: אתר
        // שמרונדר בצד הלקוח יכול לשאת סימון תקין שהסורק לא רואה, ולכן "לא נמצא" שם
        // אינו ממצא - knownCrawlNegative מטפל בזה בדיוק
        key: "local_business_schema", points: 9,
        known: (f) => f.health?.schema?.hasLocalBusiness != null
          && knownCrawlNegative(f, f.health.schema.hasLocalBusiness),
        earned: (f) => f.health?.schema?.hasLocalBusiness === true,
        // ניסוח יכולתי בלבד: גוגל מצהירה במפורש שהיא לא מבטיחה הצגת תוצאה עשירה
        gapText: () => "אין באתר סימון schema.org של עסק מקומי, ולכן הוא לא מצהיר לגוגל כתובת ושעות פתיחה ואינו זכאי לתוצאה העשירה",
        okText: () => "יש באתר סימון schema.org של עסק מקומי",
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
        // חיובי (נמצא טלפון) תמיד ידוע - זו עובדה שנמצאה, לא מסקנה מהיעדר מידע.
        // שלילי ("אין טלפון") ידוע רק כששני המקורות האפשריים נבדקו בפועל: GBP קיים,
        // וה-crawl עבד (או שאין בכלל אתר לבדוק).
        known: (f) => phoneFound(f) || (!noGbp(f) && (crawlUsable(f) || f.partial.includes("no_website"))),
        earned: phoneFound,
        gapText: () => "לא מצאנו מספר טלפון נגיש ללקוח",
        okText: () => "טלפון נגיש ללקוחות",
      },
      {
        key: "whatsapp", points: 25,
        // גילוי חיובי תקף גם באתר js_rendered - קישור שנמצא הוא נמצא. רק "לא נמצא" דורש crawl אמין.
        // ובנוסף (20.8): מקצר כתובות בעמוד מסתיר את היעד, ולכן שלילה אינה ידועה. המקרה החי
        // habarber.co.il - כפתור וואטסאפ בולט מאחורי bit.ly שהניב פער מלא ובביטחון
        known: (f) =>
          !!f.websiteSignals?.hasWhatsappLink ||
          (crawlUsable(f) && !hiddenLinkTarget(f)),
        earned: (f) => !!f.websiteSignals?.hasWhatsappLink,
        gapText: () => "אין קישור וואטסאפ באתר, הערוץ שלקוחות ישראלים מצפים לו",
        okText: () => "וואטסאפ זמין באתר",
      },
      {
        key: "contact_form", points: 15,
        known: (f) => knownCrawlNegative(f, f.websiteSignals?.hasContactForm),
        earned: (f) => !!f.websiteSignals?.hasContactForm,
        gapText: () => "אין טופס יצירת קשר באתר, לידים הולכים לאיבוד",
        okText: () => "יש טופס יצירת קשר",
      },
      {
        key: "online_booking", points: 30,
        // הזמנה ישירה (תפריט/הזמנות של העסק) מזכה כמו קביעת תור: לשניהם המשותף הוא ערוץ ישיר
        // שבבעלות העסק. פלטפורמת משלוחים במכוון אינה מזכה - היא תלות בצד שלישי, לא ערוץ ישיר.
        // **מכובה בענף אחד בלבד** (הכרעת מייסד 10, 20.8): בעלי מלאכה. אצלם החוק לא מוצג
        // ולא נספר כלל - לא כפער ולא כ"לא נבדק". העבודה היא קריאה דחופה אצל הלקוח, ואין
        // שום ערוץ הזמנה עצמי שאפשר למכור להם; מה שכן חסר להם (מענה מהיר, בקשת הצעת מחיר)
        // כבר נמדד בחוקי הוואטסאפ, הטופס והצ'אט. עדות חיובית גוברת - ראו applies ב-engine.ts.
        //
        // **שני ענפים שהמחקר סימן (R1) הוצאו מהרשימה אחרי אימות חי, וזה הממצא המרכזי כאן:**
        // 1. **קמעונאות.** הבדיקות נפלו על "אופטיקה בק", עסק אמיתי מרשימת המייסד - ואופטיקאי
        //    כן קובע תור לבדיקת ראייה. `retail_store` מאגד מכולת וחנות בגדים (לא) עם אופטיקה,
        //    מתפרה ותיקוני נעליים (כן). אין עליו תשובה אחת נכונה, וכיבוי היה מוחק פער אמיתי.
        // 2. **אוכל מהיר - וזו ההפתעה.** דוכן פלאפל היה הדוגמה שהולידה את המשימה, אבל החוק
        //    הזה כבר אינו "תורים בלבד": מ-20.8 הוא מזכה גם על **מערכת הזמנות ישירה**, וזו
        //    בדיוק ההזדמנות החזקה ביותר שהמחקר מצא לאוכל מהיר (הימנעות מעמלת משלוחים של
        //    25 עד 33 אחוז). כיבוי היה מסתיר מהם את הטענה הכספית הכי מבוססת שיש לנו.
        //    מה שכן שגוי אצלם הוא **הניסוח** ולא הניקוד - ראו gapText/okText למטה.
        //
        // **מגבלה ידועה:** `trades_onsite` מאגד גם שליחויות ואחסנה, שאצלן הזמנה אונליין כן
        // רלוונטית. עסק כזה שכבר יש לו מערכת שומר עליה (עדות חיובית גוברת), אבל כזה שאין לו
        // לא יראה את הפער. לטיפול בסבב המחקר הענפי של בעלי המלאכה
        skipFor: ["trades_onsite"],
        // גילוי חיובי תמיד ידוע. שלילה דורשת גם crawl אמין וגם שלא נשאר יעד מוסתר - אותו
        // סטנדרט בדיוק שחוק הוואטסאפ מחזיק בו, ומאותה סיבה. עד 20.8 ההגנה הזו הייתה על
        // הוואטסאפ בלבד, וכאן דווקא היא קריטית יותר: זה החוק היקר בממד (30 נקודות),
        // והמקרה החי שהוליד את פתרון המקצרים (jems.co.il, did.li) היה קישור הזמנה
        known: (f) => bookingFound(f) || (knownCrawlNegative(f, false) && !hiddenLinkTarget(f)),
        earned: bookingFound,
        // הניסוח נגזר ממה שבאמת נמצא (או לא), ולא מהנחה על סוג העסק: לדוכן פלאפל אין
        // "תיאום", ולמי שנמצאה אצלו מערכת הזמנות אסור לכתוב "יש קביעת תור" - זה פשוט לא
        // מה שראינו. תוקן 20.8 יחד עם הכיבוי הענפי, ומאותו שורש: החוק מודד ערוץ הזמנה
        // ישיר בבעלות העסק, לא תורים
        gapText: () => "אין ערוץ הזמנה או קביעת תור באתר, כל פנייה עוברת בטלפון בשעות הפעילות",
        okText: (f) => f.websiteSignals?.hasOnlineBooking
          ? "יש קביעת תור אונליין"
          : "יש מערכת הזמנות ישירה באתר",
      },
      {
        key: "email_link", points: 15,
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasEmailLink,
        earned: (f) => !!f.websiteSignals?.hasEmailLink,
        gapText: () => "אין כתובת אימייל נגישה באתר",
        okText: () => "אימייל נגיש באתר",
      },
      {
        key: "a11y_statement", points: 15,
        // תקנות נגישות השירות (חוק שוויון זכויות לאנשים עם מוגבלות) מחייבות עסקים בישראל בהצהרת
        // נגישות נגישה באתר - זו דרישה חוקית שעסקים נתבעים עליה בפועל, וקל יחסית לסגור אותה
        //
        // בכוונה לא עובר דרך knownCrawlNegative (clientFramework): קישור הצהרת נגישות הוא בדרך
        // כלל חלק מהקליפה (header/footer), server-rendered גם באתרי SPA - נבדק אמפירית במקרה
        // החי (edrieng.co.il, אתר Vue): קישור ההצהרה כן נמצא ב-HTML הגולמי. "לא נמצא" כאן עדיין
        // אמין כשה-crawl שמיש, גם אם זוהתה תשתית קליינט - לא נכון להפוך את זה ל"לא נבדק" בסתם
        known: (f) => crawlUsable(f),
        earned: (f) => !!f.websiteSignals?.hasAccessibilityStatement,
        gapText: () => "אין הצהרת נגישות באתר - דרישה חוקית בישראל שעסקים נתבעים עליה, וקל לסגור אותה",
        okText: () => "יש הצהרת נגישות באתר",
      },
      {
        key: "site_a11y", points: 15,
        // בדיקת הנגישות האוטומטית של PSI משקפת חוויה בפועל של גולשים עם מוגבלות - ציון נמוך הוא
        // גם חשיפה משפטית וגם חוויה גרועה. רכיב נגישות מותקן בלי מדידה בפועל הוא העדות הכי טובה
        // שיש כשאין ציון מדוד; אבל הוא לא מכסה על ציון מדוד גרוע (הרכיב לא תמיד עוזר בפועל)
        known: (f) => f.pageSpeed?.accessibilityScore != null || !!f.websiteSignals?.hasAccessibilityWidget,
        earned: (f) => (f.pageSpeed?.accessibilityScore != null
          ? f.pageSpeed.accessibilityScore >= 80
          : !!f.websiteSignals?.hasAccessibilityWidget),
        gapText: () => "בדיקת הנגישות האוטומטית מצאה ליקויים - חשיפה משפטית וחוויה קשה לגולשים עם מוגבלות",
        okText: (f) => (f.pageSpeed?.accessibilityScore != null ? "האתר עובר בדיקת נגישות אוטומטית" : "מותקן רכיב נגישות"),
      },
    ],
  },
  {
    key: "infrastructure", label: "תשתית דיגיטלית", weight: 0.15,
    rules: [
      {
        key: "analytics", points: 25,
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasGoogleAnalytics,
        earned: (f) => !!f.websiteSignals?.hasGoogleAnalytics,
        gapText: () => "אין Google Analytics, העסק עיוור לתנועה באתר שלו",
        okText: () => "יש מדידת תנועה (Analytics)",
      },
      {
        key: "fb_pixel", points: 16,
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasFacebookPixel,
        earned: (f) => !!f.websiteSignals?.hasFacebookPixel,
        gapText: () => "אין פיקסל פייסבוק, אי אפשר לעשות רימרקטינג למבקרים",
        okText: () => "פיקסל פייסבוק מותקן",
      },
      {
        key: "chat_widget", points: 12,
        known: (f) => knownCrawlNegative(f, f.websiteSignals?.hasChatWidget),
        earned: (f) => !!f.websiteSignals?.hasChatWidget,
        // כשיש כפתור וואטסאפ הבעלים רואה "צ'אט" באתר שלו - הניסוח חייב להכיר בזה,
        // אחרת הדוח נשמע טועה (ממצא מייסד על פיצה סבא אדוארד: בועת וואטסאפ נראית כמו צ'אט)
        gapText: (f) =>
          f.websiteSignals?.hasWhatsappLink
            ? "אין צ'אט חי באתר - כפתור הוואטסאפ עוזר, אבל בלי מענה אוטומטי פניות מחוץ לשעות הפעילות מחכות"
            : "אין צ'אט באתר, פניות מחוץ לשעות הפעילות אובדות",
        okText: () => "יש צ'אט באתר",
      },
      {
        key: "multi_page", points: 8,
        known: crawlUsable, earned: (f) => (f.websiteSignals?.pagesCrawled ?? 0) >= 4,
        gapText: () => "בסריקה נמצאו עמודים בודדים בלבד, אתר רזה מקשה על לקוחות למצוא מידע",
        okText: (f) => `אתר עם ${f.websiteSignals?.pagesCrawled} עמודים ומעלה`,
      },
      // ===== בדיקות תקינות (health) - כל אחת known רק אם הבדיקה באמת הושלמה =====
      {
        key: "domain_expiry", points: 22,
        known: (f) => f.health?.domain?.daysToExpiry != null,
        // 30 יום הוא הסף שבו עוד אפשר לפעול בנחת. מתחת לזה זו משימה דחופה
        earned: (f) => (f.health?.domain?.daysToExpiry ?? 0) > 30,
        gapText: (f) => {
          const days = f.health?.domain?.daysToExpiry ?? 0;
          return days < 0
            ? `רישום הדומיין פג לפני ${Math.abs(days)} ימים - האתר והדואר תלויים בו`
            : `רישום הדומיין נגמר בעוד ${days} ימים. כשהוא נגמר, האתר והדואר יורדים ביחד`;
        },
        okText: (f) => `רישום הדומיין בתוקף לעוד ${f.health?.domain?.daysToExpiry} ימים`,
      },
      {
        // ממצא אחד להגדרת הדואר כולה (הכרעת מייסד 20.8), במקום spf ו-dmarc כשני פערים.
        // שתי סיבות: לבעל עסק זו תקלה אחת עם תיקון אחד (מישהו נכנס ל-DNS ומסדר), ופער בלי
        // פריט קטלוג הוא חצי הבטחה - עכשיו יש פריט אחד שמכסה את שניהם. 7 נקודות, בדיוק
        // כמו dmarc לבדו קודם, ולכן סך הממד נשאר 100 ואף ציון קיים לא זז
        key: "mail_auth", points: 7,
        known: (f) => mailAuthGap(f) !== undefined,
        earned: (f) => mailAuthGap(f) === null,
        gapText: (f) => mailAuthGap(f) ?? "",
        okText: () => "אימות הדואר של הדומיין מוגדר: רשומת SPF אחת ורשומת DMARC",
      },
      {
        key: "safe_browsing", points: 10,
        known: (f) => f.health?.safeBrowsing?.flagged != null,
        earned: (f) => f.health?.safeBrowsing?.flagged === false,
        // ניסוח מסויג ומיוחס, כפי שתנאי השימוש של גוגל דורשים
        gapText: () => "האתר מסומן כרגע ברשימת האתרים המסוכנים של גוגל, וגולשים בכרום עלולים לקבל מסך אזהרה במקום האתר (מידע מגוגל)",
        // בכוונה לא "האתר מאובטח": בדקנו סימון אחד, לא ביצענו בדיקת אבטחה
        okText: () => "האתר לא נמצא ברשימת האתרים המסוכנים של גוגל",
      },
    ],
  },
  {
    key: "process", label: "בשלות תהליכים", weight: 0.2,
    // מבוסס על מודל העסק מהראיון (אבן דרך 4, משימה 1) - processRules(null) שומר בדיוק על
    // ה"stub" שהיה כאן עד עכשיו (known תמיד false, "אין מידע") לכל קריאה שלא מעבירה מודל
    // (scan-time scoring הקיים, run-diagnosis.ts, לא זז בכלל)
    rules: processRules(null),
  },
];

// buildDimensions(model): DIMENSIONS עם ממד process קשור למודל נתון - כל שאר הממדים זהים
// (אותם אובייקטים, ScanFindings-בלבד). model חסר/null => בדיוק DIMENSIONS (ראו scoreWithModel ב-engine.ts)
export function buildDimensions(model?: BusinessModel | null): DimensionDef[] {
  return DIMENSIONS.map((d) => (d.key === "process" ? { ...d, rules: processRules(model ?? null) } : d));
}
