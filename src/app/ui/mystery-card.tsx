"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MysteryChannel } from "../../pipeline/types";
import { probeSentence, CHANNEL_LABEL } from "../../pipeline/mystery/evidence";
import type { MysteryView, ProbeStatus } from "../../server/run-mystery";

// כרטיס הלקוח הסמוי בדוח (משימה 10). מה שבעל העסק רואה: לפני - כפתור והסבר קצר; בזמן
// הבדיקה - "בדרך" בלבד, בכוונה בלי מועד ובלי "נשלח" (מי שיודע שהמייל כבר יצא הולך לענות
// עליו בעצמו, וזה מקלקל את המדידה); אחרי - משפט לכל ערוץ עם יום, שעה ומשך שנמדד.
// הכרטיס מקבל תצוגה סריאליזבילית (תאריכים כ-ISO) כי הוא רכיב לקוח

export interface MysteryProbeCardView {
  id: string;
  channel: MysteryChannel;
  status: ProbeStatus;
  sentAt: string | null;
  answeredAt: string | null;
  closedAt: string | null;
  failReason: string | null;
}

export interface MysteryCardView {
  probes: MysteryProbeCardView[];
  reportedAt: string | null;
  available: MysteryChannel[];
  canRequest: boolean;
  nextAllowedAt: string | null;
}

export function toMysteryCardView(v: MysteryView): MysteryCardView {
  return {
    probes: v.probes.map((p) => ({
      id: p.id, channel: p.channel, status: p.status,
      sentAt: p.sentAt?.toISOString() ?? null, answeredAt: p.answeredAt?.toISOString() ?? null,
      closedAt: p.closedAt?.toISOString() ?? null, failReason: p.failReason,
    })),
    reportedAt: v.reportedAt?.toISOString() ?? null,
    available: v.available,
    canRequest: v.canRequest,
    nextAllowedAt: v.nextAllowedAt?.toISOString() ?? null,
  };
}

const DATE_FMT = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric" });

// "במייל, דרך הטופס באתר ובוואטסאפ" - רשימה בעברית עם ו' לפני האחרון
function joinHe(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ו${items[items.length - 1]}`;
}

function resultLine(p: MysteryProbeCardView): string {
  if ((p.status === "answered" || p.status === "unanswered") && p.sentAt) {
    return probeSentence({
      channel: p.channel, sentAt: p.sentAt,
      ...(p.answeredAt ? { answeredAt: p.answeredAt } : {}),
      closedAt: p.closedAt ?? p.sentAt,
    });
  }
  if (p.status === "failed") return `${CHANNEL_LABEL[p.channel]}: לא הצלחנו לשלוח - ${p.failReason ?? "השליחה נכשלה"}`;
  return `${CHANNEL_LABEL[p.channel]}: לא נבדק הפעם`;
}

export function MysteryCard({ diagnosisId, view, className = "" }: { diagnosisId: string; view: MysteryCardView; className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const open = view.probes.some((p) => p.status === "planned" || p.status === "sent");
  const finished = view.probes.length > 0 && !open;

  async function request() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch(`/api/mystery/${diagnosisId}`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "משהו השתבש, נסו שוב בעוד רגע");
        setState("error");
        return;
      }
      setState("idle");
      router.refresh();
    } catch {
      setError("אין חיבור כרגע, נסו שוב בעוד רגע");
      setState("error");
    }
  }

  const channelsText = joinHe(view.available.map((c) => CHANNEL_LABEL[c]));

  return (
    <section id="mystery" data-anchor className={`shell ${className}`}>
      <div className="core card-pad">
        <h2 className="card-title">הלקוח הסמוי</h2>
        <p className="-mt-2 mb-5 max-w-[64ch] text-sm leading-relaxed" style={{ color: "var(--mut)" }}>
          פנייה אמיתית כלקוח, בערוצים שיש לך. בודקים דבר אחד: אם ומתי עונים.
        </p>

        {open && (
          <div className="facts">
            <div className="f work">
              <span className="k">הבדיקה בדרך</span>
              <span className="v">נפנה {channelsText}. נעדכן אותך במייל כשיש תוצאה.</span>
            </div>
          </div>
        )}

        {finished && (
          <ul className="space-y-2.5 text-[15px] leading-relaxed">
            {view.probes.map((p) => (
              <li key={p.id} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: p.status === "answered" ? "var(--acc2)" : "var(--mut)" }} />
                <span>{resultLine(p)}</span>
              </li>
            ))}
          </ul>
        )}

        {!open && view.canRequest && (
          <div className={finished ? "mt-5" : ""}>
            <button type="button" className="btn" disabled={state === "sending"} onClick={request}>
              {state === "sending" ? "רגע" : finished ? "בדוק שוב" : "בדוק איך עונים אצלי"}
            </button>
            <p className="mt-3 max-w-[64ch] text-sm leading-relaxed" style={{ color: "var(--mut)" }}>
              בשלושת ימי העבודה הקרובים נשלח פנייה כלקוח {channelsText}. לא נזמין, לא נקנה, ובסוף נזדהה.
              נעדכן אותך במייל כשיש תוצאה.
            </p>
          </div>
        )}

        {!open && !view.canRequest && view.available.length === 0 && (
          <p className={`text-sm leading-relaxed ${finished ? "mt-4" : ""}`} style={{ color: "var(--mut)" }}>
            אין ערוץ שאפשר לבדוק: לא מצאנו באתר כתובת מייל או טופס, ואין מספר טלפון בגוגל.
          </p>
        )}

        {finished && !view.canRequest && view.available.length > 0 && view.nextAllowedAt && (
          <p className="mt-4 text-sm" style={{ color: "var(--mut)" }}>
            בדיקה נוספת אפשר להזמין מ-{DATE_FMT.format(new Date(view.nextAllowedAt))}.
          </p>
        )}

        {error && <p className="form-error mt-3" role="alert">{error}</p>}
      </div>
    </section>
  );
}
