// טווח הזמן של מסך השימוש (בקשת מייסד 20.8). עד עכשיו המסך היה נעול על שבעה ימים.
//
// טהור לחלוטין - Date נכנס, Date יוצא - ולכן נבדק אופליין בלי מסד ובלי שעון אמיתי.
// כל החישוב עובר דרך "עכשיו" מוזרק, אותו דפוס כמו שאר הצינור.

export const RANGE_KEYS = ["today", "7d", "30d", "90d", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

/** רזולוציית הקיבוץ בגרף. נגזרת מאורך הטווח ולא נבחרת ידנית - 90 עמודות יומיות
 *  על מסך אחד הן קו מרוח, ו-24 שעות בעמודה אחת הן נקודה בודדת */
export type Bucket = "hour" | "day" | "week";

export interface UsageRange {
  key: RangeKey;
  from: Date;
  /** בלעדי: השאילתה היא created_at >= from AND created_at < to */
  to: Date;
  bucket: Bucket;
  label: string;
}

export const RANGE_LABEL: Record<RangeKey, string> = {
  today: "24 שעות",
  "7d": "7 ימים",
  "30d": "30 ימים",
  "90d": "90 ימים",
  custom: "טווח מותאם",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const PRESET_DAYS: Record<Exclude<RangeKey, "custom">, number> = {
  today: 1, "7d": 7, "30d": 30, "90d": 90,
};

// גבול עליון לטווח מותאם. בלי חסם, תאריך התחלה של 1970 היה סורק את כל הטבלה
const MAX_CUSTOM_DAYS = 730;

function bucketFor(spanMs: number): Bucket {
  const days = spanMs / DAY_MS;
  if (days <= 2) return "hour";
  if (days <= 60) return "day";
  return "week";
}

/** תאריך בפורמט YYYY-MM-DD מקלט טופס. כל דבר אחר הוא null ולא ניחוש */
function parseDay(value: string | undefined): Date | null {
  if (value == null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseUsageRange(
  params: { range?: string; from?: string; to?: string },
  now: Date = new Date(),
): UsageRange {
  const raw = params.range;

  if (raw === "custom") {
    const from = parseDay(params.from);
    const to = parseDay(params.to);
    // שני התאריכים חייבים להיות תקינים ובסדר הנכון. אחרת נופלים לברירת המחדל במקום
    // להציג טווח שהמשתמש לא ביקש
    if (from != null && to != null && from < to) {
      // "עד" בטופס הוא יום כולל, ולכן הגבול הוא סוף אותו יום
      const end = new Date(to.getTime() + DAY_MS);
      const capped = end.getTime() - from.getTime() > MAX_CUSTOM_DAYS * DAY_MS
        ? new Date(from.getTime() + MAX_CUSTOM_DAYS * DAY_MS)
        : end;
      return {
        key: "custom", from, to: capped,
        bucket: bucketFor(capped.getTime() - from.getTime()),
        label: `${params.from} עד ${params.to}`,
      };
    }
  }

  const key: Exclude<RangeKey, "custom"> =
    raw === "today" || raw === "30d" || raw === "90d" ? raw : "7d";
  const span = PRESET_DAYS[key] * DAY_MS;
  return {
    key,
    from: new Date(now.getTime() - span),
    to: now,
    bucket: bucketFor(span),
    label: RANGE_LABEL[key],
  };
}

/** הפרמטרים שמחזירים את אותו טווח בדיוק - לשמירת המצב בכתובת בין עמודים */
export function rangeParams(r: UsageRange, from?: string, to?: string): Record<string, string | undefined> {
  return r.key === "custom"
    ? { range: "custom", from, to }
    : { range: r.key === "7d" ? undefined : r.key };
}
