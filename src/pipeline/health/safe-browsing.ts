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

/**
 * מחזיר undefined כשהבדיקה לא רצה או נכשלה - וזה חייב להישאר כך. "לא בדקנו" ו"בדקנו
 * ולא נמצא" הם שני דברים שונים, והשני הוא היחיד שמותר להציג כתשובה.
 */
export async function readSafeBrowsing(
  url: string,
  opts: SafeBrowsingOptions = {},
): Promise<SafeBrowsingCheck | undefined> {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) return undefined;

  // מארח פנימי לא נשלח לגוגל: הוא לא ייבדק ממילא, וזו דליפת כתובת פנימית לצד שלישי
  if (forbiddenHostOf(url)) return undefined;

  const fetchImpl: FetchLike = opts.fetchImpl ?? defaultFetch;
  const now = opts.now ?? (() => new Date());

  const params = new URLSearchParams({ uri: url });
  for (const t of THREAT_TYPES) params.append("threatTypes", t);

  const startedAt = Date.now();
  try {
    const res = await fetchImpl(`${WEB_RISK_URL}?${params.toString()}`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const errText = await readErrorBody(res);
      reportExternalCall({
        service: "webrisk", context: "uris_search", ok: false, durationMs: Date.now() - startedAt,
        payload: { url, status: res.status, error: errText },
      });
      return undefined;
    }
    const body = (await res.json()) as WebRiskBody;
    reportExternalCall({
      service: "webrisk", context: "uris_search", ok: true, durationMs: Date.now() - startedAt,
      payload: { url, body },
    });
    // גוף ריק = לא נמצא ברשימה. נוכחות threat = נמצא
    return { flagged: body.threat != null, checkedAt: now().toISOString() };
  } catch (err) {
    reportExternalCall({
      service: "webrisk", context: "uris_search", ok: false, durationMs: Date.now() - startedAt,
      payload: { url, error: err instanceof Error ? err.message : String(err) },
    });
    return undefined;
  }
}
