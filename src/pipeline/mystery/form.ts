import * as cheerio from "cheerio";
import { defaultFetch, type FetchLike } from "../http";
import { assertFetchableUrl } from "../forbidden-host";
import { assertResolvesPublic, defaultLookup, type LookupLike } from "../resolve-guard";
import { NON_CONTACT_FORM_RE } from "../crawler/signals";

// שליחת פנייה דרך טופס יצירת הקשר באתר (משימה 10). בלי דפדפן: טופס HTML רגיל, Contact Form 7
// (שמקבל שליחה בלי JS לכתובת העמוד) וטפסי PHP פשוטים עובדים; טפסי Wix/Elementor שמוגשים ב-JS
// לא - ואז התוצאה היא "לא הצלחנו לשלוח דרך הטופס", לא האשמה של העסק.
// אותה שרשרת הגנות בדיוק כמו הסורק: assertFetchableUrl ואז assertResolvesPublic לפני כל בקשה

export interface FormIdentity {
  name: string;
  email: string;
  message: string;
  phone?: string;
}

export interface ParsedForm {
  action: string;
  fields: Record<string, string>;
  hasMessageField: boolean;
}

const NAME_RE = /name|full|שם|fname|first/i;
const PHONE_RE = /tel|phone|mobile|cell|טלפון|נייד/i;
const EMAIL_RE = /mail|מייל|דוא/i;
const SUBJECT_RE = /subject|נושא/i;
const MESSAGE_RE = /message|msg|comment|body|הודעה|פרטים|תוכן/i;

// טיפוס מבני במקום הטיפוסים הפנימיים של cheerio - רק attr נדרש כאן
function hint($el: { attr(name: string): string | undefined }): string {
  return [$el.attr("name"), $el.attr("id"), $el.attr("placeholder"), $el.attr("aria-label"), $el.attr("type")]
    .filter((s): s is string => s != null)
    .join(" ");
}

/**
 * מאתר את טופס יצירת הקשר הראשון בעמוד וממלא אותו. null = אין טופס שאפשר לשלוח (אין טופס,
 * טופס GET כמו חיפוש, או טופס בלי שדה טקסט אמיתי). שדות חבויים עוברים כמו שהם - הם
 * ה-nonce/מזהה של מנוע הטפסים; שדה נדרש שלא זוהה מקבל את השם, כדי שהשליחה לא תיפול על חובה
 */
export function findContactForm(html: string, pageUrl: string, identity: FormIdentity): ParsedForm | null {
  const $ = cheerio.load(html);
  let found: ParsedForm | null = null;
  $("form").each((_i, el) => {
    if (found != null) return;
    const $f = $(el);
    const attrs = [$f.attr("role"), $f.attr("class"), $f.attr("id"), $f.attr("action")].join(" ").toLowerCase();
    if (NON_CONTACT_FORM_RE.test(attrs)) return;
    if (($f.attr("method") ?? "get").toLowerCase() !== "post") return;

    const fields: Record<string, string> = {};
    let hasMessageField = false;
    let realFields = 0;
    let submitTaken = false;

    $f.find("input, textarea, select").each((_j, fieldEl) => {
      const $in = $(fieldEl);
      const name = $in.attr("name");
      if (!name) return;
      const tag = (fieldEl as { tagName?: string }).tagName?.toLowerCase() ?? "input";
      const type = ($in.attr("type") ?? (tag === "input" ? "text" : tag)).toLowerCase();
      const required = $in.attr("required") != null;

      if (type === "hidden") { fields[name] = $in.attr("value") ?? ""; return; }
      if (type === "submit" || type === "image") {
        // מנועי טפסים ישנים בודקים isset($_POST['submit']) - הכפתור הראשון עם שם נשלח, פעם אחת
        if (!submitTaken) { fields[name] = $in.attr("value") ?? "1"; submitTaken = true; }
        return;
      }
      if (type === "button" || type === "reset" || type === "file") return;
      if (type === "checkbox" || type === "radio") {
        if (required && fields[name] == null) fields[name] = $in.attr("value") ?? "on";
        return;
      }
      if (tag === "select") {
        const first = $in.find("option").filter((_k, o) => ($(o).attr("value") ?? "").trim() !== "").first();
        if (first.length > 0 && (required || fields[name] == null)) fields[name] = first.attr("value") ?? "";
        realFields++;
        return;
      }
      realFields++;
      const h = hint($in);
      if (tag === "textarea" || MESSAGE_RE.test(h)) {
        fields[name] = identity.message; hasMessageField = true; return;
      }
      if (type === "email" || EMAIL_RE.test(h)) { fields[name] = identity.email; return; }
      if (type === "tel" || PHONE_RE.test(h)) { if (identity.phone) fields[name] = identity.phone; else if (required) fields[name] = ""; return; }
      if (SUBJECT_RE.test(h)) { fields[name] = "שאלה קטנה"; return; }
      if (NAME_RE.test(h)) { fields[name] = identity.name; return; }
      if (required) fields[name] = identity.name;
    });

    if (!hasMessageField || realFields < 2) return;
    let action: string;
    try {
      action = new URL($f.attr("action") ?? "", pageUrl).href;
    } catch {
      return; // action לא תקין - לא טופס שאפשר לשלוח
    }
    found = { action, fields, hasMessageField };
  });
  return found;
}

export interface SubmitDeps {
  fetchImpl?: FetchLike;
  lookupImpl?: LookupLike;
  timeoutMs?: number;
}

export interface SubmitResult { ok: boolean; status: number }

const SUBMIT_TIMEOUT_MS = 15_000;
const USER_AGENT = "BedekEsek-MysteryShopper/0.1 (+contact form check)";

/**
 * שולח את הטופס. ok = השרת קיבל (2xx/3xx). זו לא הוכחה שהפנייה הגיעה לתיבה של מישהו -
 * ההוכחה היחידה היא תשובה שחוזרת לכתובת הבדיקה; כאן רק מבדילים בין "נשלח" ל"לא הצלחנו לשלוח"
 */
export async function submitForm(form: ParsedForm, deps: SubmitDeps = {}): Promise<SubmitResult> {
  const fetchImpl = deps.fetchImpl ?? defaultFetch;
  const lookupImpl = deps.lookupImpl ?? defaultLookup;
  const url = assertFetchableUrl(form.action);
  await assertResolvesPublic(url, lookupImpl);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(form.fields)) body.append(k, v);
  const res = await fetchImpl(url.href, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      // חלק ממנועי הטפסים דוחים שליחה בלי Referer מאותו אתר
      Referer: url.origin + "/",
    },
    body: body.toString(),
    redirect: "manual",
    signal: AbortSignal.timeout(deps.timeoutMs ?? SUBMIT_TIMEOUT_MS),
  });
  void res.body?.cancel().catch(() => {});
  return { ok: res.status >= 200 && res.status < 400, status: res.status };
}
