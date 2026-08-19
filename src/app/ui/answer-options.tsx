"use client";
// תיבת תשובות אמריקאית (הכרעת מייסד 18.8): במקום צ'יפים מפוזרים - תיבה אחת ובתוכה שורה
// מלאה לכל תשובה, עם סימון אות בתחילת השורה. בעל עסק שעונה מהטלפון מכיר את הצורה הזאת
// מכל שאלון שמילא: אין מה ללמוד, והמטרה היא כל השורה ולא צ'יפ בגודל אצבע.
//
// הרכיב תצוגתי בלבד - אין בו לוגיקה עסקית, אין בו קריאות רשת, והוא מרונדר גם בלי שום
// handler (ההדגמה בדף הנחיתה מעבירה רק options ו-selected). ראו כלל השימוש החוזר
// ב-CLAUDE.md: אותה תיבה משרתת את הראיון האמיתי ואת ההדגמה, ולא נבנית פעמיים.
import { useEffect, useId, useState } from "react";

// אותיות הסימון. מעבר לשש נופלים למספר - רשת ביטחון, לא מצב רגיל (בנק השאלות מחזיק ארבע)
const KEYS = ["א", "ב", "ג", "ד", "ה", "ו"];
const keyOf = (i: number) => KEYS[i] ?? String(i + 1);

function CheckGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function PencilGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16z" />
    </svg>
  );
}

export interface AnswerOptionsProps {
  options: string[];
  /** התשובות המסומנות. בבחירה בודדת זו רק "הקבלה" הרגעית - הלחיצה כבר שלחה */
  selected?: string[];
  multiSelect?: boolean;
  disabled?: boolean;
  /** בלי onPick הרכיב מרונדר כתצוגה בלבד (span ולא button) - אין מטרת לחיצה מתה */
  onPick?: (label: string) => void;
  /** בלי onOther שורת "אחר" לא מוצגת כלל - בהדגמה אין לאן לכתוב */
  onOther?: () => void;
  /** גרסה מוקטנת לפאנל ההדגמה בדף הנחיתה, בעקבות התקדים של repC.mini */
  compact?: boolean;
  /** מזהה פסקת השאלה, כדי שהקבוצה תיקרא בשמה האמיתי ולא בתווית גנרית */
  labelledBy?: string;
}

export function AnswerOptions({
  options, selected = [], multiSelect = false, disabled = false,
  onPick, onOther, compact = false, labelledBy,
}: AnswerOptionsProps) {
  const hintId = useId();
  const interactive = onPick != null;
  // "הקבלה" של בחירה בודדת: הלחיצה שולחת והפאנל מתחלף, אז בלי סימון מקומי המשתמש לא
  // רואה את הבחירה שלו אף פעם. מצב תצוגתי בלבד, מתאפס כשמגיעה שאלה חדשה
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { setPicked(null); }, [options]);

  const marked = (label: string) => selected.includes(label) || picked === label;
  // מסמנים "נענתה" רק כשבאמת יש בחירה - תיבה מנוטרלת בלי בחירה היא ישנה, לא שנענתה
  const answered = disabled && (picked != null || selected.length > 0);

  const hint = !interactive
    ? null
    : multiSelect
      ? "אפשר לסמן כמה תשובות ואז ללחוץ שליחה"
      : "בחרו תשובה אחת. הלחיצה שולחת מיד";

  function rowProps(label: string) {
    if (!interactive) return { as: "span" as const };
    return {
      as: "button" as const,
      type: "button" as const,
      disabled,
      onClick: () => {
        if (!multiSelect) setPicked(label);
        onPick?.(label);
      },
      ...(multiSelect ? { role: "checkbox", "aria-checked": marked(label) } : {}),
    };
  }

  return (
    <div className={compact ? "ansbox compact" : "ansbox"}>
      {hint && <p className="ans-hint" id={hintId}>{hint}</p>}
      <div
        className="ans"
        data-multi={multiSelect ? "true" : undefined}
        data-answered={answered ? "true" : undefined}
        role={interactive ? "group" : undefined}
        aria-label={interactive && labelledBy == null ? "אפשרויות תשובה" : undefined}
        aria-labelledby={interactive ? labelledBy : undefined}
        aria-describedby={interactive && hint ? hintId : undefined}
      >
        {options.map((label, i) => {
          const { as: Tag, ...rest } = rowProps(label);
          return (
            <Tag
              key={label}
              className="ans-row"
              data-on={marked(label) ? "true" : undefined}
              style={{ ["--i" as string]: i }}
              {...rest}
            >
              <span className="ans-mark" aria-hidden="true">
                <span className="let">{keyOf(i)}</span>
                <span className="chk"><CheckGlyph /></span>
              </span>
              <span className="ans-lb">{label}</span>
            </Tag>
          );
        })}

        {/* "אחר" יושב באותה תיבה - זו תשובה לאותה שאלה - ומובדל בקו מקווקו וסימון עיפרון */}
        {interactive && onOther != null && (
          <button
            type="button"
            className="ans-row ans-other"
            disabled={disabled}
            style={{ ["--i" as string]: options.length }}
            onClick={onOther}
          >
            <span className="ans-mark" aria-hidden="true"><PencilGlyph /></span>
            <span className="ans-lb">אחר - אכתוב בעצמי</span>
          </button>
        )}
      </div>
    </div>
  );
}
