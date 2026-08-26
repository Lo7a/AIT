import Link from "next/link";

// עימוד משותף לכל מסכי הניהול. רכיב אחד ולא אחד לכל טבלה - טבלה רביעית עם עימוד משלה
// הייתה מתפצלת מהשלוש הראשונות בתיקון הראשון (כלל השימוש החוזר ב-CLAUDE.md).
//
// קישורים ולא כפתורים: העימוד עובר דרך ה-URL, ולכן הוא ניתן לשיתוף, לרענון ולפתיחה
// בלשונית חדשה, ועובד גם לפני שה-JS נטען. שאר הפילטרים על העמוד נשמרים כי הרכיב
// מקבל את כל ה-searchParams הקיימים ורק דורס את מספר העמוד.

export interface PagerProps {
  page: number;
  pages: number;
  /** סך התוצאות - מוצג כדי שיהיה ברור שהעימוד הוא חלק מתוך משהו, לא הכל */
  total: number;
  /** הנתיב הבסיסי, למשל /admin/catalog */
  basePath: string;
  /** הפרמטרים הנוכחיים, כדי שסינון וחיפוש ישרדו מעבר עמוד. ערך-מערך = מפתח חוזר
   *  ב-URL (כך צ'קבוקסים באותו שם מגישים טופס - לוח המשימות, 21.8) */
  params?: Record<string, string | string[] | undefined>;
  /** מה נספר, בעברית: "פריטים", "משתמשים" */
  unit?: string;
}

// חלון של עד חמישה מספרים סביב העמוד הנוכחי. בלי חלון, ספרייה של 40 עמודים הייתה
// מייצרת שורת מספרים ארוכה מהטבלה עצמה
function windowOf(page: number, pages: number): number[] {
  const span = 5;
  let start = Math.max(1, page - Math.floor(span / 2));
  const end = Math.min(pages, start + span - 1);
  start = Math.max(1, end - span + 1);
  const out: number[] = [];
  for (let p = start; p <= end; p++) out.push(p);
  return out;
}

export function Pager({ page, pages, total, basePath, params = {}, unit = "תוצאות" }: PagerProps) {
  // עמוד יחיד: אין מה לנווט, ושורת עימוד ריקה היא רעש
  if (pages <= 1) {
    return total > 0 ? <p className="pg-sum">{total} {unit}</p> : null;
  }

  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) for (const item of v) qs.append(k, item);
      else if (v != null && v !== "") qs.set(k, v);
    }
    if (p > 1) qs.set("page", String(p));
    else qs.delete("page");
    const s = qs.toString();
    return s === "" ? basePath : `${basePath}?${s}`;
  };

  const nums = windowOf(page, pages);

  return (
    <nav className="pg" aria-label="עימוד">
      <span className="pg-sum">
        {total} {unit} · עמוד {page} מתוך {pages}
      </span>
      <span className="pg-nums">
        {page > 1 && (
          <Link href={href(page - 1)} className="pg-btn" rel="prev" aria-label="העמוד הקודם">
            הקודם
          </Link>
        )}
        {nums[0] > 1 && <span className="pg-gap" aria-hidden="true">...</span>}
        {nums.map((p) => (
          <Link
            key={p}
            href={href(p)}
            className={p === page ? "pg-btn on num" : "pg-btn num"}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </Link>
        ))}
        {nums.at(-1)! < pages && <span className="pg-gap" aria-hidden="true">...</span>}
        {page < pages && (
          <Link href={href(page + 1)} className="pg-btn" rel="next" aria-label="העמוד הבא">
            הבא
          </Link>
        )}
      </span>
    </nav>
  );
}
