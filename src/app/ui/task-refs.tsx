import Link from "next/link";

// אזכורי משימות בטקסט חופשי הופכים לקישורים פנימיים ללוח (בקשת מייסד 24.8):
// "#15" או "משימה 15" בהודעת סוכן או בשורת מצב מקשרים ישר לדף המשימה.
//
// כנות גם כאן: מקושר רק מספר שקיים בלוח בפועל (הדף מעביר את רשימת המספרים החיים) -
// "#99" שלא קיים נשאר טקסט, לא קישור שבור. הסוכנים כותבים את האזכורים האלה ממילא
// בפרוטוקול הקיים, אז אין שום תחביר חדש ללמוד.
const TASK_REF = /(משימה\s*#?\d{1,5}|#\d{1,5})/g;

export function TaskRefs({ text, nums }: { text: string; nums: ReadonlySet<number> }) {
  const parts = text.split(TASK_REF);
  if (parts.length === 1) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) => {
        // split עם קבוצה לוכדת: אינדקסים אי-זוגיים הם ההתאמות עצמן
        if (i % 2 === 1) {
          const num = Number(part.match(/\d+/)?.[0]);
          if (nums.has(num)) {
            return (
              <Link
                key={i}
                href={`/admin/tasks/${num}`}
                className="font-semibold underline decoration-dotted underline-offset-2"
                style={{ color: "var(--acc-soft)" }}
              >
                {part}
              </Link>
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/** רשימת המספרים החיים בלוח - השאילתה של הדפים שמציגים אזכורים */
export type TaskNums = ReadonlySet<number>;

export function toTaskNums(rows: { num: number }[]): TaskNums {
  return new Set(rows.map((r) => r.num));
}
