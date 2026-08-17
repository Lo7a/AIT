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
        <linearGradient id="gsc" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
    </svg>
  );
}
