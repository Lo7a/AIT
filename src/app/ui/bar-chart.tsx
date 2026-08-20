// גרף עמודות לסדרת זמן. רכיב שרת טהור - SVG בלבד, בלי state ובלי ספריית תרשימים.
//
// למה עמודות ולא קו: הנתון הוא ספירה בתוך דלי זמן בדיד (יום, שעה, שבוע), לא ערך רציף
// שנמדד ברגעים. קו בין שתי ספירות מרמז על ערכי ביניים שלא היו.
//
// **שני מדדים = שני גרפים, לעולם לא שני צירים.** קריאות וטוקנים נבדלים בסדרי גודל,
// וציר שני היה גורם לשתי סדרות להיראות כאילו הן נחתכות במקום שהן לא.
//
// הצבעים: הסגול הוא המדד עצמו, והאדום שמור לכשלים - צבע מצב, ולכן הוא תמיד מגיע עם
// תווית במקרא ולא לבדו. שני הגוונים אומתו במודד של סקיל התרשימים בשני המצבים: הפרדה
// ל-CVD 17.6 בכהה ו-22.5 בבהיר, וניגודיות מעל 3:1 מול שני המשטחים.

export interface BarPoint {
  label: string;
  /** מה שמוצג בריחוף - המספרים המלאים, כי על הגרף עצמו יש תווית אחת בלבד */
  title: string;
  value: number;
  /** חלק מתוך value שהוא כשל. 0 = אין */
  alert?: number;
}

const H = 132;
const PAD_TOP = 14;
const GAP = 2;
const RADIUS = 4;

export function BarChart({
  points, unitLabel, alertLabel, emptyText = "אין נתונים בטווח הזה",
}: {
  points: BarPoint[];
  /** שם המדד. משמש גם כתווית המקרא של הסדרה הראשית */
  unitLabel: string;
  /** קיים = יש סדרת כשלים והמקרא מציג שתי רשומות */
  alertLabel?: string;
  emptyText?: string;
}) {
  if (points.length === 0) {
    return <p className="chart-empty">{emptyText}</p>;
  }

  const max = Math.max(...points.map((p) => p.value), 1);
  const n = points.length;
  // ה-viewBox עובד ביחידות ולא בפיקסלים: הרוחב נמתח, הגובה קבוע
  const W = Math.max(n * 10, 100);
  const slot = W / n;
  const barW = Math.max(slot - GAP, 1);
  const plotH = H - PAD_TOP;
  const y = (v: number) => PAD_TOP + plotH - (v / max) * plotH;

  // תווית ישירה על השיא בלבד. מספר על כל עמודה הופך גרף לטבלה גרועה
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  // שלוש תוויות ציר לכל היותר: ראשונה, אמצעית, אחרונה
  const ticks = n <= 2 ? points.map((_p, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart-svg" role="img"
        aria-label={`${unitLabel} לאורך הטווח שנבחר`}>
        {/* רשת נסוגה: שני קווים בלבד, כדי שהעין תראה את הנתון ולא את הסרגל */}
        {[0.5, 1].map((f) => (
          <line key={f} x1={0} x2={W} y1={y(max * f)} y2={y(max * f)}
            stroke="var(--row-line)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
        ))}

        {points.map((p, i) => {
          const x = i * slot + GAP / 2;
          const alert = Math.min(p.alert ?? 0, p.value);
          const ok = p.value - alert;
          const topY = y(p.value);
          const okH = ((ok / max) * plotH);
          const alertH = ((alert / max) * plotH);
          return (
            <g key={p.label}>
              {/* title נותן חיווי ריחוף מקורי של הדפדפן, בלי JS וברכיב שרת. פחות מלוטש
                  מטולטיפ משלנו, וזה מה שמאפשר למסך הזה להישאר בלי צד-לקוח בכלל */}
              <title>{p.title}</title>
              {alert > 0 && (
                <rect x={x} y={topY} width={barW} height={Math.max(alertH, 1)}
                  rx={RADIUS} ry={RADIUS} fill="var(--bad)" />
              )}
              {ok > 0 && (
                <rect
                  x={x}
                  y={alert > 0 ? topY + alertH + GAP : topY}
                  width={barW}
                  height={Math.max(alert > 0 ? okH - GAP : okH, 1)}
                  rx={RADIUS} ry={RADIUS}
                  fill="var(--acc)"
                />
              )}
            </g>
          );
        })}
      </svg>

      <div className="chart-x" aria-hidden="true">
        {ticks.map((i) => (
          <span key={i} style={{ insetInlineStart: `${((i + 0.5) / n) * 100}%` }}>{points[i].label}</span>
        ))}
      </div>

      <figcaption className="chart-legend">
        <span><i className="sw" style={{ background: "var(--acc)" }} />{unitLabel}</span>
        {alertLabel != null && (
          <span><i className="sw" style={{ background: "var(--bad)" }} />{alertLabel}</span>
        )}
        <b className="num">{`שיא: ${points[peak].value.toLocaleString("he-IL")} · ${points[peak].label}`}</b>
      </figcaption>
    </figure>
  );
}
