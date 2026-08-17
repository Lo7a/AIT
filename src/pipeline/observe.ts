// תפר התצפית על קריאות חיצוניות (הכרעת מייסד 17.8, ארכיון פיילודים מלא): שכבת ה-pipeline
// נשארת טהורה (אפס תלות ב-DB) - הצרכנים (llm/client, google/places, google/pagespeed) רק
// מדווחים לכאן, והשרת מזריק sink שכותב לטבלת external_calls (server/external-log.ts). בלי
// sink מוזרק (בדיקות, CLI) הדיווח הוא no-op שקוף. חוק ברזל: תצפית לעולם לא זורקת ולעולם
// לא משנה את תוצאת הקריאה שנצפתה.

export interface ExternalCallRecord {
  service: string; // gemini | places | pagespeed | שירותים עתידיים
  context: string; // interview_extract | narrative | roadmap_reasoning | places_search | places_details | psi | ...
  ok: boolean;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  // הפיילוד המלא של התשובה (אחרי stripHeavyStrings אצל המדווח) - הארכיון שממנו ממלאים
  // עמודות ייעודיות בעתיד בלי לקרוא לשירות שוב
  payload?: unknown;
}

type Sink = (record: ExternalCallRecord) => void;

let sink: Sink | null = null;

export function setExternalCallSink(s: Sink | null): void {
  sink = s;
}

export function reportExternalCall(record: ExternalCallRecord): void {
  try {
    sink?.(record);
  } catch {
    // sink שנשבר לא מפיל את הקריאה העסקית - הארכיון הוא תצפית, לא תלות
  }
}

// חיתוך מחרוזות ענק מתוך פיילוד לפני שמירה: צילומי המסך של PageSpeed מגיעים כ-base64 בתוך
// שדות טקסט (מאות KB לצילום) - חסרי ערך כטקסט ושורפים את מכסת המסד. הסף גבוה בכוונה: אף שדה
// טקסטואלי אמיתי (ביקורת, נרטיב, תשובת LLM) לא מתקרב אליו. גנרי לפי אורך ולא לפי שם שדה -
// עמיד לשינויי מבנה של כל שירות עתידי. יעד עתידי: העלאת ה-blobs לבאקט Storage במקום חיתוך.
const MAX_PAYLOAD_STRING = 20_000;

export function stripHeavyStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_PAYLOAD_STRING ? `[stripped ${value.length} chars]` : value;
  }
  if (Array.isArray(value)) return value.map(stripHeavyStrings);
  if (value != null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = stripHeavyStrings(v);
    return out;
  }
  return value;
}
