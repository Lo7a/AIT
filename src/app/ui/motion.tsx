"use client";

import { useEffect, useState } from "react";

// רכיבי תנועה קטנים ומשותפים: ספירת מספרים, חוגת ציון, מד מקטעים ופס מילוי.
// כולם מכבדים prefers-reduced-motion (קופצים ישר לערך הסופי).

function prefersReduced(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// decimals: ספרות אחרי הנקודה. נוסף כשהנחיתה הוצרכה לספור עד 98.17 - הרחבה של הרכיב
// הקיים ולא רכיב שני שעושה אותו דבר (כלל השימוש החוזר ב-CLAUDE.md)
export function CountUp({ to, duration = 1400, decimals = 0, className }: {
  to: number; duration?: number; decimals?: number; className?: string;
}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (prefersReduced()) { setValue(to); return; }
    let raf = 0;
    let t0: number | null = null;
    const tick = (ts: number) => {
      if (t0 == null) t0 = ts;
      const p = Math.min((ts - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setValue(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);

  return <span className={className}>{value.toFixed(decimals)}</span>;
}

// חוגת הציון: הקשת נמתחת אל הציון אחרי הטעינה (transition ב-globals: .dial .fill)
export function ScoreDial({ score, size = 172, stroke = 11, label = "מתוך 100", caption }: {
  score: number; size?: number; stroke?: number; label?: string; caption?: string;
}) {
  const r = size / 2 - stroke - 5;
  const circumference = 2 * Math.PI * r;
  const target = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    if (prefersReduced()) { setOffset(target); return; }
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setOffset(target)));
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return (
    <div className="dial" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="fill"
          cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="mid">
        <span className="big num"><CountUp to={Math.round(score)} /></span>
        {label !== "" && <small>{label}</small>}
      </div>
      {caption != null && <span className="dial-cap">{caption}</span>}
    </div>
  );
}

// טבעת קטנה לשורות רשימה (ציון עסק). tone="warn" לציונים חלשים.
export function MiniRing({ score, size = 40, tone }: {
  score: number; size?: number; tone?: "warn";
}) {
  const stroke = 4;
  const r = size / 2 - stroke;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <span className="miniring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="t" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className={tone === "warn" ? "f w" : "f"}
          cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="v num">{Math.round(score)}</span>
    </span>
  );
}

// מד מקטעים (חמישה ברירת מחדל): מתמלא מקטע אחרי מקטע עד האחוז הנתון
export function SegRail({ percent, segments = 5 }: { percent: number; segments?: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (prefersReduced()) { setOn(true); return; }
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(raf);
  }, []);

  const p = Math.max(0, Math.min(100, percent)) / 100;
  return (
    <div className="seg-rail" aria-hidden="true">
      {Array.from({ length: segments }, (_, i) => {
        const fillRatio = Math.max(0, Math.min(1, p * segments - i));
        return (
          <span key={i} className="kseg">
            <i style={{
              transform: `scaleX(${on ? fillRatio : 0})`,
              transitionDelay: `${i * 90 + 500}ms`,
            }} />
          </span>
        );
      })}
    </div>
  );
}

// פס מילוי בודד (למשל התקדמות הראיון)
export function FillBar({ percent }: { percent: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (prefersReduced()) { setOn(true); return; }
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(raf);
  }, []);

  const p = Math.max(0, Math.min(100, percent)) / 100;
  return (
    <span className="fill-bar">
      <i style={{ insetInlineEnd: 0, width: "100%", transform: `scaleX(${on ? p : 0})` }} />
    </span>
  );
}
