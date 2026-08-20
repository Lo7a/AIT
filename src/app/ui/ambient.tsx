// רקע האווירה של המערכת: כתמי אור סגול וברקת + רשת עומק, וההגדרה של גרדיאנט
// הטבעות (gsc) שכל ה-SVG-ים במסכים צורכים. רכיבי שרת טהורים - בלי state.

export function Ambient() {
  return (
    <>
      <div className="orbs" aria-hidden="true">
        <div className="orb a" />
        <div className="orb b" />
        <div className="orb c" />
      </div>
      <div className="grid-tex" aria-hidden="true" />
    </>
  );
}

export function GscDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        {/* דרך הטוקנים ולא בערכים קשיחים: הצבעים כאן היו הסגול והברקת של המצב הכהה,
            ולכן כל טבעת ציון במערכת נשארה בגוון של המצב הכהה גם במצב הבהיר - שם
            --acc ו---acc2 כהים יותר בכוונה כדי לעמוד בניגודיות על רקע בהיר.
            stop-color היא תכונת CSS אמיתית ולכן היא מקבלת var() */}
        <linearGradient id="gsc" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "var(--acc)" }} />
          <stop offset="100%" style={{ stopColor: "var(--acc2)" }} />
        </linearGradient>
      </defs>
    </svg>
  );
}
