import type { MysteryChannel, MysteryProbeResult, ScanFindings } from "../types";

// ראיית הלקוח הסמוי (משימה 10, 30.8): קריאה של findings.mystery לחוקי הניקוד ולטקסטים.
// טהור לגמרי - אין כאן DB ואין שעון; כל מה שמוצג נגזר ממה שנמדד אצל העסק עצמו.

// חלון התגובה שמזכה את חוק lead_handling: שעה. המקור: Harvard Business Review, "The Short Life
// of Online Sales Leads" (Oldroyd, McElheran, Elkington, 2011) - עסקים שחזרו לפנייה בתוך שעה
// הכשירו אותה פי שבעה יותר מאלה שחיכו אפילו שעה נוספת. זה פרמטר של חוק (כמו הנקודות),
// לא מספר שמוצג ללקוח: הטקסט מציג תמיד את מה שנמדד אצלו בפועל, לא את הסף
export const RESPONSE_WINDOW_MS = 60 * 60 * 1000;

export type ProbeVerdict = "none" | "answered_fast" | "answered_slow" | "unanswered";

// "פנה במייל" - בתוך משפט
export const CHANNEL_LABEL: Record<MysteryChannel, string> = {
  email: "במייל",
  form: "דרך הטופס באתר",
  whatsapp: "בוואטסאפ",
  phone: "בטלפון",
};

// שם הערוץ לבדו - לעמודת טבלה ולתגית
export const CHANNEL_NAME: Record<MysteryChannel, string> = {
  email: "מייל",
  form: "טופס באתר",
  whatsapp: "וואטסאפ",
  phone: "טלפון",
};

const ISRAEL_TZ = "Asia/Jerusalem";

const WEEKDAY_FMT = new Intl.DateTimeFormat("he-IL", { timeZone: ISRAEL_TZ, weekday: "long" });
const TIME_FMT = new Intl.DateTimeFormat("he-IL", {
  timeZone: ISRAEL_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function results(f: ScanFindings): MysteryProbeResult[] {
  return f.mystery?.results ?? [];
}

export function answerDelayMs(r: MysteryProbeResult): number | null {
  if (r.answeredAt == null) return null;
  const delay = Date.parse(r.answeredAt) - Date.parse(r.sentAt);
  return Number.isFinite(delay) ? Math.max(0, delay) : null;
}

/**
 * הפסק על כל הסבב: תשובה אחת שלא הגיעה = פער, גם אם ערוץ אחר ענה - הלקוח שפנה בערוץ הזה
 * נשאר בלי תשובה. כשכל הערוצים ענו, הסבב מזכה רק אם כולם ענו בתוך החלון
 */
export function probeVerdict(f: ScanFindings): ProbeVerdict {
  const rs = results(f);
  if (rs.length === 0) return "none";
  if (rs.some((r) => r.answeredAt == null)) return "unanswered";
  const allFast = rs.every((r) => {
    const d = answerDelayMs(r);
    return d != null && d <= RESPONSE_WINDOW_MS;
  });
  return allFast ? "answered_fast" : "answered_slow";
}

/** "ביום שלישי בשעה 14:30" - שעון ישראל, כי כך בעל העסק זוכר את היום שלו */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `ב${WEEKDAY_FMT.format(d)} בשעה ${TIME_FMT.format(d)}`;
}

/** משך בעברית מדוברת: "דקה", "42 דקות", "שעתיים ו-5 דקות", "3 ימים". תמיד עיגול כלפי מטה */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "פחות מדקה";
  if (minutes < 60) return minutes === 1 ? "דקה" : `${minutes} דקות`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    const h = hours === 1 ? "שעה" : hours === 2 ? "שעתיים" : `${hours} שעות`;
    return rest === 0 ? h : `${h} ו-${rest} דקות`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "יום" : days === 2 ? "יומיים" : `${days} ימים`;
}

/** משפט אחד לתוצאה אחת - תמיד עם יום, שעה ומשך שנמדד. אף פעם לא שיעור */
export function probeSentence(r: MysteryProbeResult): string {
  const opened = `הלקוח הסמוי פנה ${CHANNEL_LABEL[r.channel]} ${formatWhen(r.sentAt)}`;
  const delay = answerDelayMs(r);
  if (delay != null) return `${opened} וקיבל תשובה אחרי ${formatDuration(delay)}`;
  const waited = Date.parse(r.closedAt) - Date.parse(r.sentAt);
  return `${opened} ולא קיבל תשובה במשך ${formatDuration(Number.isFinite(waited) ? Math.max(0, waited) : 0)}`;
}

/** שורת העובדה לחוק הניקוד: כל הערוצים בסבב, מופרדים בנקודה-פסיק. null = לא נבדק */
export function probeFactLine(f: ScanFindings): string | null {
  const rs = results(f);
  if (rs.length === 0) return null;
  return rs.map(probeSentence).join("; ");
}
