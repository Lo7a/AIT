import type { HealthSignals } from "../types";

// הפיכת ממצאי חבילת התקינות לשורות שאפשר להראות לבעל העסק.
//
// למה מודול נפרד ולא בתוך presenter.ts: presenter הוא מפות תוויות (מפתח -> מחרוזת),
// וכאן יש החלטות - איזה ממצא חמור, מה ההסבר, איזה תאריך מוצג. הפרדה מאפשרת לבדוק
// את ההחלטות האלה בלי לרנדר שום מסך.
//
// הכלל שמנחה את כל הקובץ: **שדה שלא הגיע מוצג "לא נבדק" בלי שום הסבר.** הסבר הוא
// טענה, וטענה על משהו שלא נבדק היא בדיוק מה שהמוצר הזה קיים כדי לא לעשות.

export type HealthTone = "good" | "warn" | "bad" | "unknown";

export interface HealthFact {
  key: "domain" | "mail" | "schema" | "safeBrowsing";
  /** מה נבדק */
  label: string;
  /** הממצא עצמו, בשורה אחת */
  value: string;
  tone: HealthTone;
  /** מה זה אומר בפועל לבעל העסק. null כשלא נבדק - אין מה להסביר */
  why: string | null;
  /** פרט משני שנאסף בדרך: שם הרשם, ספק הדואר */
  note: string | null;
}

const DATE_FMT = new Intl.DateTimeFormat("he-IL", { dateStyle: "long" });

const NOT_CHECKED = "לא נבדק";

/** שורה של בדיקה שלא רצה או שלא החזירה נתון */
const unchecked = (key: HealthFact["key"], label: string): HealthFact => ({
  key, label, value: NOT_CHECKED, tone: "unknown", why: null, note: null,
});

function formatDate(iso: string | undefined): string | null {
  if (iso == null) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : DATE_FMT.format(d);
}

// ספי התראה על תוקף הדומיין. 30 יום הוא הרף שבו רשמים מתחילים להתריע ושבו עוד
// אפשר לחדש בלי דרמה; 90 הוא מרחק נשימה סביר לעסק שלא מסתכל על זה בכלל
const EXPIRY_URGENT_DAYS = 30;
const EXPIRY_SOON_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

function domainFact(health: HealthSignals, now: Date): HealthFact {
  const d = health.domain;
  if (d == null || (d.expiresAt == null && d.daysToExpiry == null)) {
    return unchecked("domain", "רישום הדומיין");
  }

  const when = formatDate(d.expiresAt);
  // daysToExpiry נשמר ברגע הסריקה, והדוח נקרא גם שבועות אחר כך. כשיש תאריך פקיעה
  // סופרים אותו מחדש מול היום, אחרת הדוח מציג ספירה לאחור שקפאה בזמן
  const expiry = d.expiresAt != null ? new Date(d.expiresAt) : null;
  const days = expiry != null && !Number.isNaN(expiry.getTime())
    ? Math.floor((expiry.getTime() - now.getTime()) / DAY_MS)
    : d.daysToExpiry ?? null;
  const note = d.registrar != null ? `רשום דרך ${d.registrar}` : null;

  if (days != null && days < 0) {
    return {
      key: "domain", label: "רישום הדומיין",
      value: when != null ? `פג ב-${when}` : "פג",
      tone: "bad",
      why: "כל עוד הרישום לא מחודש, האתר והדואר בדומיין הזה לא עובדים.",
      note,
    };
  }

  const tone: HealthTone =
    days == null ? "good"
      : days <= EXPIRY_URGENT_DAYS ? "bad"
        : days <= EXPIRY_SOON_DAYS ? "warn"
          : "good";

  // ההסבר משתנה לפי המרחק: מרחוק זו עובדה, מקרוב זו פעולה שצריך לעשות
  const why =
    days == null ? "אם הרישום פג, האתר והדואר מפסיקים לעבוד."
      : days <= EXPIRY_SOON_DAYS
        ? `נשארו ${days} ימים. אם הרישום פג, האתר והדואר מפסיקים לעבוד.`
        : `נשארו ${days} ימים.`;

  return {
    key: "domain", label: "רישום הדומיין",
    value: when != null ? `בתוקף עד ${when}` : "בתוקף",
    tone, why, note,
  };
}

function mailFact(health: HealthSignals): HealthFact {
  const m = health.mail;
  if (m == null || m.hasMx == null) return unchecked("mail", "דואר בדומיין העסק");

  const note = m.provider != null ? `הדואר מנוהל אצל ${m.provider}` : null;

  if (!m.hasMx) {
    return {
      key: "mail", label: "דואר בדומיין העסק",
      value: "לא מוגדר",
      tone: "warn",
      // בלי קביעה שזו טעות: יש עסקים שמכוון עובדים מג'ימייל פרטי
      why: "אין רשומת דואר לדומיין, כך שכתובת בדומיין העסק לא תקבל הודעות.",
      note: null,
    };
  }

  if (m.hasDmarc === true) {
    return {
      key: "mail", label: "דואר בדומיין העסק",
      value: "מוגדר ומוגן",
      tone: "good",
      why: "יש DMARC, ולכן קשה לשלוח מייל שנראה כאילו הוא ממך.",
      note,
    };
  }

  // אין DMARC: זה הממצא המעשי ביותר בכל החבילה, כי הוא נוגע בהתחזות בשם העסק
  if (m.hasSpf === true) {
    return {
      key: "mail", label: "דואר בדומיין העסק",
      value: "מוגדר, בלי DMARC",
      tone: "warn",
      why: "יש SPF אבל אין DMARC, ולכן אפשר עדיין לשלוח מיילים בשמך בלי שייחסמו.",
      note,
    };
  }

  return {
    key: "mail", label: "דואר בדומיין העסק",
    value: m.hasSpf === false ? "מוגדר, בלי הגנה" : "מוגדר",
    tone: "warn",
    why: "אין SPF ואין DMARC, ולכן אפשר לשלוח מיילים בשמך בלי שייחסמו.",
    note,
  };
}

function schemaFact(health: HealthSignals): HealthFact {
  const s = health.schema;
  if (s == null || s.hasLocalBusiness == null) return unchecked("schema", "סימון עסק מקומי באתר");

  if (s.hasLocalBusiness) {
    return {
      key: "schema", label: "סימון עסק מקומי באתר",
      value: "קיים",
      tone: "good",
      why: "גוגל יכול לקרוא מהאתר את הכתובת, השעות ופרטי העסק.",
      note: s.types != null && s.types.length > 0 ? `סוג הסימון: ${s.types.join(", ")}` : null,
    };
  }

  return {
    key: "schema", label: "סימון עסק מקומי באתר",
    value: "לא נמצא",
    tone: "warn",
    why: "בלי הסימון הזה גוגל צריך לנחש מהאתר מה הכתובת והשעות שלך.",
    note: null,
  };
}

function safeBrowsingFact(health: HealthSignals): HealthFact {
  const sb = health.safeBrowsing;
  if (sb == null || sb.flagged == null) return unchecked("safeBrowsing", "סימון אתר מסוכן בגוגל");

  if (sb.flagged) {
    return {
      key: "safeBrowsing", label: "סימון אתר מסוכן בגוגל",
      value: "האתר מסומן",
      tone: "bad",
      why: "מי שנכנס לאתר מקבל מסך אזהרה אדום לפני שהוא רואה משהו.",
      note: null,
    };
  }

  return {
    key: "safeBrowsing", label: "סימון אתר מסוכן בגוגל",
    value: "נקי",
    tone: "good",
    why: "האתר לא מופיע ברשימת האתרים המסוכנים של גוגל.",
    note: null,
  };
}

/**
 * ארבע השורות, תמיד באותו סדר, כולל אלה שלא נבדקו. אין דילוג על שורה חסרה בכוונה:
 * "לא נבדק" גלוי הוא מה שמבדיל את הדוח הזה מדוח שמייצר ממצאים מהאוויר.
 * מחזיר ריק רק כשלא רצה אף בדיקה (עסק בלי אתר) - אז אין בכלל מה להציג.
 */
export function healthFacts(
  health: HealthSignals | undefined,
  now: Date = new Date(),
): HealthFact[] {
  if (health == null) return [];
  return [domainFact(health, now), mailFact(health), schemaFact(health), safeBrowsingFact(health)];
}
