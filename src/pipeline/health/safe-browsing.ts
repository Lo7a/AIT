import type { SafeBrowsingCheck } from "../types";
import { defaultFetch, readErrorBody, type FetchLike } from "../http";
import { forbiddenHostOf } from "../forbidden-host";
import { reportExternalCall } from "../observe";

// בדיקה מול רשימת האתרים המסוכנים של גוגל (Web Risk). הערך העסקי: אתר וורדפרס שנפרץ
// מאבד כמעט את כל התנועה שלו מאחורי מסך אזהרה אדום, ובעל העסק בדרך כלל האחרון שיודע
// כי אצלו בדפדפן האתר נראה תקין.
//
// שתי החלטות שנעולות כאן:
// 1. uris:search בלבד. hashes:search עולה 50 דולר לאלף קריאות ואין לו שכבה חינמית,
//    ולכן שימוש בו הוא באג עלות ולא בחירה.
// 2. checkedAt נשמר תמיד ומוצג תמיד. ממצא אבטחה תקף לרגע הבדיקה בלבד, ולהציג אותו
//    בלי תאריך זו טענה על ההווה שלא בדקנו.
const WEB_RISK_URL = "https://webrisk.googleapis.com/v1/uris:search";
const THREAT_TYPES = ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"] as const;
const TIMEOUT_MS = 8_000;

export interface SafeBrowsingOptions {
  apiKey?: string;
  fetchImpl?: FetchLike;
  now?: () => Date;
}

type WebRiskBody = { threat?: { threatTypes?: string[] } };

// שגיאת סטטוס שכבר דווחה ליומן הקריאות בנקודת היצירה - ה-catch מזהה אותה ולא מדווח שוב
class WebRiskHttpError extends Error {}

/**
 * מחזיר undefined כשהבדיקה דולגה במכוון (מארח פנימי), וזורק על כשל תשתית - מפתח חסר,
 * שגיאת HTTP או כשל רשת - כדי שהסיבה תגיע להערות האיסוף דרך collectHealth (תחקיר 21.8:
 * מפתח חסר בסביבת ורסל היה נבלע כאן בשקט). "לא בדקנו" ו"בדקנו ולא נמצא" נשארים שני
 * דברים שונים: כשל לעולם לא הופך לתשובה, רק לשדה חסר עם סיבה רשומה.
 */
export async function readSafeBrowsing(
  url: string,
  opts: SafeBrowsingOptions = {},
): Promise<SafeBrowsingCheck | undefined> {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY חסר - בדיקת Safe Browsing לא רצה");

  // מארח פנימי לא נשלח לגוגל: הוא לא ייבדק ממילא, וזו דליפת כתובת פנימית לצד שלישי.
  // דילוג מכוון ולא כשל - לכן undefined בשקט ולא זריקה
  if (forbiddenHostOf(url)) return undefined;

  const fetchImpl: FetchLike = opts.fetchImpl ?? defaultFetch;
  const now = opts.now ?? (() => new Date());

  const params = new URLSearchParams({ uri: url });
  for (const t of THREAT_TYPES) params.append("threatTypes", t);

  const startedAt = Date.now();
  let res: Awaited<ReturnType<FetchLike>>;
  let body: WebRiskBody;
  try {
    res = await fetchImpl(`${WEB_RISK_URL}?${params.toString()}`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const errText = await readErrorBody(res);
      reportExternalCall({
        service: "webrisk", context: "uris_search", ok: false, durationMs: Date.now() - startedAt,
        payload: { url, status: res.status, error: errText },
      });
      // הסטטוס לבדו מספיק להערות האיסוף; גוף השגיאה המלא נשאר ביומן הקריאות בלבד
      throw new WebRiskHttpError(`Web Risk החזיר ${res.status}`);
    }
    body = (await res.json()) as WebRiskBody;
  } catch (err) {
    // שגיאת סטטוס כבר דווחה ליומן בענף שלה - לא מדווחים פעמיים
    if (err instanceof WebRiskHttpError) throw err;
    reportExternalCall({
      service: "webrisk", context: "uris_search", ok: false, durationMs: Date.now() - startedAt,
      payload: { url, error: err instanceof Error ? err.message : String(err) },
    });
    // כשל רשת או timeout נזרק הלאה אל הערות האיסוף - לא נבלע יותר
    throw err;
  }
  reportExternalCall({
    service: "webrisk", context: "uris_search", ok: true, durationMs: Date.now() - startedAt,
    payload: { url, body },
  });
  // גוף ריק = לא נמצא ברשימה. נוכחות threat = נמצא
  return { flagged: body.threat != null, checkedAt: now().toISOString() };
}
