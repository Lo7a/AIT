// תזמון הלקוח הסמוי (משימה 10): מועד אקראי בשעות הפעילות, בתוך שלושת ימי העבודה הקרובים.
// הבעלים יודע שהבדיקה תבוא, לא מתי - אחרת הוא (או הצוות) יושב ומחכה ליד המייל.
// טהור: השעון והאקראיות מוזרקים, כדי שהבדיקות יריצו כל תאריך בלי לחכות.

export const ISRAEL_TZ = "Asia/Jerusalem";

// פרק פתיחה בפורמט Places API (New): day 0 = ראשון, שעות מקומיות. close חסר = פתוח כל היום
export interface OpeningPeriod {
  open: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
}

export interface ScheduleInput {
  now: Date;
  random: () => number; // [0,1) - Math.random בייצור, קבוע בבדיקות
  periods?: OpeningPeriod[] | null; // שעות הפתיחה מגוגל; חסר = ברירת המחדל למטה
}

// בלי שעות פתיחה: ימי א-ה, עשר עד ארבע - השעות שבהן כמעט כל עסק בישראל מאויש
const DEFAULT_OPEN_HOUR = 10;
const DEFAULT_CLOSE_HOUR = 16;
const DEFAULT_WORK_DAYS = new Set([0, 1, 2, 3, 4]);
// כמה ימי עבודה קדימה, ומרווח מינימלי מהרגע הנוכחי (שלא יישלח תוך כדי הלחיצה)
const HORIZON_WINDOWS = 3;
const LEAD_MS = 60 * 60 * 1000;
const MIN_WINDOW_MS = 30 * 60 * 1000;
const MAX_LOOKAHEAD_DAYS = 10;

const PARTS_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: ISRAEL_TZ, hourCycle: "h23",
  year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short",
});
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface IsraelParts { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

/** הרכיבים המקומיים (שעון ישראל) של רגע נתון */
export function israelParts(date: Date): IsraelParts {
  const parts: Record<string, string> = {};
  for (const p of PARTS_FMT.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  };
}

// ההיסט של שעון ישראל ברגע נתון (כולל שעון קיץ) - ההפרש בין "אותם רכיבים ב-UTC" לרגע עצמו
function israelOffsetMs(date: Date): number {
  const p = israelParts(date);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** Date אמיתי מרכיבים מקומיים בשעון ישראל. שני סיבובים כדי לתפוס מעבר שעון קיץ באותו יום */
export function israelDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let guess = naive - israelOffsetMs(new Date(naive));
  guess = naive - israelOffsetMs(new Date(guess));
  return new Date(guess);
}

interface Window { start: Date; end: Date }

// חלונות הפעילות של יום מקומי נתון (התחלה/סיום כ-Date אמיתי). פרקים שנפתחים ביום הזה בלבד;
// פרק שנסגר ביום אחר (לילה) נחתך בחצות - מספיק לבחירת שעה, לא מנסים לדמות פתיחה של 24 שעות
function dayWindows(year: number, month: number, day: number, weekday: number, periods: OpeningPeriod[] | null | undefined): Window[] {
  if (periods == null || periods.length === 0) {
    if (!DEFAULT_WORK_DAYS.has(weekday)) return [];
    return [{ start: israelDate(year, month, day, DEFAULT_OPEN_HOUR, 0), end: israelDate(year, month, day, DEFAULT_CLOSE_HOUR, 0) }];
  }
  const out: Window[] = [];
  for (const p of periods) {
    if (p.open.day !== weekday) continue;
    const start = israelDate(year, month, day, p.open.hour, p.open.minute);
    const end = p.close == null || p.close.day !== weekday
      ? israelDate(year, month, day, 23, 59)
      : israelDate(year, month, day, p.close.hour, p.close.minute);
    if (end.getTime() > start.getTime()) out.push({ start, end });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * מועד השליחה: אחד משלושת חלונות הפעילות הקרובים (ימים שונים), נקודה אקראית בתוכו.
 * null = לא נמצא אף חלון בעשרת הימים הקרובים (עסק שגוגל מדווחת עליו כסגור כל השבוע) -
 * הקורא נופל לברירת המחדל בלי שעות פתיחה
 */
export function pickSendTime(input: ScheduleInput): Date | null {
  const earliest = input.now.getTime() + LEAD_MS;
  const windows: Window[] = [];
  const start = israelParts(input.now);
  // מריצים יום-יום לפי לוח השנה המקומי: מוסיפים 24 שעות לצהרי היום המקומי כדי שמעבר שעון
  // קיץ (יום של 23 או 25 שעות) לא ידלג על תאריך ולא יכפיל אותו
  let cursor = israelDate(start.year, start.month, start.day, 12, 0);
  for (let i = 0; i < MAX_LOOKAHEAD_DAYS && windows.length < HORIZON_WINDOWS; i++) {
    const p = israelParts(cursor);
    for (const w of dayWindows(p.year, p.month, p.day, p.weekday, input.periods)) {
      const from = Math.max(w.start.getTime(), earliest);
      if (w.end.getTime() - from >= MIN_WINDOW_MS) {
        windows.push({ start: new Date(from), end: w.end });
        break; // חלון אחד ליום - שלושה ימים שונים, לא שלושה חלונות באותו יום
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  if (windows.length === 0) return null;
  const w = windows[Math.min(windows.length - 1, Math.floor(input.random() * windows.length))];
  const span = w.end.getTime() - w.start.getTime();
  // דקות שלמות - מועד כמו 10:37, לא מילישנייה אקראית
  const at = w.start.getTime() + Math.floor((input.random() * span) / 60_000) * 60_000;
  return new Date(at);
}

/** שעות הפתיחה מגוף Places Details הגולמי (scan.raw.placeDetails). כל סטייה מהצורה = null */
export function openingPeriodsFromRaw(raw: unknown): OpeningPeriod[] | null {
  if (raw == null || typeof raw !== "object") return null;
  const hours = (raw as { regularOpeningHours?: unknown }).regularOpeningHours;
  if (hours == null || typeof hours !== "object") return null;
  const periods = (hours as { periods?: unknown }).periods;
  if (!Array.isArray(periods)) return null;
  const out: OpeningPeriod[] = [];
  for (const p of periods) {
    const open = (p as { open?: unknown })?.open;
    if (!isPoint(open)) continue;
    const close = (p as { close?: unknown })?.close;
    out.push({ open, ...(isPoint(close) ? { close } : {}) });
  }
  return out.length > 0 ? out : null;
}

function isPoint(v: unknown): v is { day: number; hour: number; minute: number } {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.day === "number" && typeof o.hour === "number" && typeof o.minute === "number"
    && o.day >= 0 && o.day <= 6 && o.hour >= 0 && o.hour <= 23 && o.minute >= 0 && o.minute <= 59;
}
