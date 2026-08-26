import type { ScanFindings } from "../../pipeline/types";
import { hostOf } from "../../pipeline/report/presenter";

// שורת העובדות על העסק ועל הסריקה, בסרגל העליון של הדוח, הראיון ותוכנית העבודה (בקשת
// אלעד 26.8: אותה שורה בכל המסכים הרלוונטיים, ולא רק בדוח). רכיב שרת טהור - בלי הוקים
// ובלי מצב, ולכן מרונדר גם מתוך מסך לקוח בלי "use client".
// כל פרט כאן הוא ממצא שנאסף בפועל: שדה שלא הגיע פשוט לא מוצג. עדיף פחות פרטים ממספר
// שלא נמדד (כלל אפס המצאות ב-CLAUDE.md).

export interface BusinessFactsProps {
  /** שם העסק מעל העובדות, במרכז הסרגל (בקשת אלעד 26.8). בלעדיו מוצגת שורת העובדות לבדה */
  name?: string;
  city: string | null;
  website: string | null;
  scannedAt: Date | null;
  reviewCount: number | null;
  rating: number | null;
  pagesCrawled: number | null;
}

// נבנה פעם אחת ברמת המודול - הפורמט זהה בכל קריאה
const SCAN_DATE_FMT = new Intl.DateTimeFormat("he-IL", { dateStyle: "long" });

/** גזירה אחת לכל המסכים. הממצאים מהסריכה (ביקורות, דירוג, עמודים), והעיר והאתר מרשומת
    העסק ולא מ-Places: הרשומה היא מה שנשמר ואולי תוקן, הממצאים הם מה שנמצא */
export function factsOf(
  findings: ScanFindings,
  business: { city: string | null; website: string | null },
  scannedAt: Date | null,
): BusinessFactsProps {
  return {
    city: business.city,
    website: business.website,
    scannedAt,
    reviewCount: findings.business.reviewCount ?? null,
    rating: findings.business.rating ?? null,
    pagesCrawled: findings.websiteSignals?.pagesCrawled ?? null,
  };
}

// גליפים בקו אחד, אותו סגנון של NAV_ICONS במעטפת. אייקון לפני כל עובדה הוא מה שמאפשר
// לסרוק שורה של חמישה פרטים בלי לקרוא אותה - העין תופסת "מיקום, תאריך, אתר, דירוג,
// עמודים" מהצורות. הכוכב מלא ולא בקו, כי כוכב מלא הוא הסימן שכולם מכירים מגוגל
const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const GLYPH = {
  pin: (
    <svg viewBox="0 0 24 24" {...STROKE} aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" {...STROKE} aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" {...STROKE} aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18" /><path d="M12 3a14 14 0 0 0 0 18" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" />
    </svg>
  ),
  doc: (
    <svg viewBox="0 0 24 24" {...STROKE} aria-hidden="true">
      <path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6" />
    </svg>
  ),
};

export function BusinessFacts({ name, city, website, scannedAt, reviewCount, rating, pagesCrawled }: BusinessFactsProps) {
  const hasGoogle = rating != null || reviewCount != null;
  const hasPages = pagesCrawled != null && pagesCrawled > 0;
  const hasFacts = city != null || website != null || scannedAt != null || hasGoogle || hasPages;
  // בלי שם ובלי אף עובדה אין בלוק - לא מכל ריק שתופס מקום בסרגל
  if (name == null && !hasFacts) return null;

  // השם מעל העובדות, שניהם ממורכזים: כותרת ושורת משנה, אותו דפוס של page-head. העובדות
  // בלי מסגרות - מופרדות בנקודה, כמו שורת המטא של הדוח מאז ומתמיד; חמישה אריחים בסרגל
  // נראו כמו סרגל כלים (משוב אלעד 26.8)
  return (
    <div className="bar-ident">
      {name != null && <b>{name}</b>}
      {hasFacts && (
    <div className="bar-facts">
      {city != null && city !== "" && <span>{GLYPH.pin}{city}</span>}
      {scannedAt != null && <span>{GLYPH.clock}נסרק {SCAN_DATE_FMT.format(scannedAt)}</span>}
      {/* קישור אמיתי, ומציג את המארח בלבד כמו שדפדפן מציג. הכתובת המלאה עם הפרוטוקול
          והלוכסן היא מה שהמכונה צריכה, לא מה שבעל העסק קורא.
          dir=ltr על המארח בלבד ולא על הקישור כולו: הקישור נשאר בכיוון הסרגל, ולכן
          הגלובוס יושב מימין לטקסט כמו כל שאר האייקונים בשורה */}
      {website != null && website !== "" && (
        <a href={website} target="_blank" rel="noopener noreferrer">
          {GLYPH.globe}<span className="clip" dir="ltr">{hostOf(website)}</span>
        </a>
      )}
      {/* דירוג וביקורות יחד, כמו שגוגל מציג אותם - זו צורה שכל בעל עסק מזהה מיד */}
      {hasGoogle && (
        <span>
          {rating != null && <><span className="star">{GLYPH.star}</span><b className="num">{rating}</b></>}
          {rating != null && reviewCount != null && <span className="sep" aria-hidden="true">·</span>}
          {reviewCount != null && <><b className="num">{reviewCount.toLocaleString("he-IL")}</b> ביקורות</>}
        </span>
      )}
      {/* "נסרקו" ולא "יש": זה מה שהזחילה עברה בפועל, לא מספר העמודים באתר */}
      {hasPages && <span>{GLYPH.doc}<b className="num">{pagesCrawled}</b> עמודים נסרקו</span>}
    </div>
      )}
    </div>
  );
}
