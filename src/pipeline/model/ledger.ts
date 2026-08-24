import type { ScanFindings } from "../types";
import type { BusinessModel } from "./business-model";
import type { QuantityAnswers } from "../../server/interview-repo";
import { isKnownVolume, isKnownResponseTime, isKnownDealValue } from "../roadmap/loss-calc";
import { processRules } from "../score/dimensions";
import { industryOf } from "../industry";

// פנקס החוסרים (משימה 19, הכרעת אלעד 24.8): מה חסר לאבחון, ומה כל חוסר פותח.
//
// **למה זה מחליף את אחוז השלמות במסך.** "35%" הוא מספר על עצמנו, לא על העסק, והוא לא אומר
// לבעל העסק מה לעשות ולא מה ירוויח. שתי ההודעות שהוא ניסה למסור נאמרות כאן במפורש: מה חסר,
// ומה זה פותח. completenessPct נשאר בקוד ומזין את recommendNextStep ואת מסכי הניהול - הוא
// פשוט מפסיק להיות מוצג לבעל העסק.
//
// **העיקרון: כל רשומה נגזרת מצרכן אמיתי בקוד** (מחקר R5, סעיף 6: "שאלה נכנסת לבנק רק אם ידוע
// מראש מי צורך את התשובה"). אין כאן רשימת משאלות - כל שורה מצביעה על קוד שמתנהג אחרת בלעדיה.
// רשומה בלי צרכן לא נכנסת, וצרכן שיורד מחייב להוריד את הרשומה שלו.
//
// **למה known נבדק דרך הצרכן ולא דרך "יש ערך בשדה".** תשובת "אחר" נשמרת במסד ככל תשובה
// אחרת, אבל personalLossLine לא מפרש אותה ומחזיר null. פנקס שהיה בודק קיום ערך היה מסמן
// את החוסר כמולא ומבטיח שורה שלא תופיע. לכן isKnownVolume וחבריו יושבים ב-loss-calc.ts
// עצמו, מול אותן טבלאות שהחישוב משתמש בהן.
//
// המודול טהור: בלי I/O, בלי Date ובלי random. תשובות הכמות מגיעות כפרמטר (getQuantityAnswers
// קורא אותן מההודעות לפי questionKey) ולא נקראות כאן, כדי שכל הבדיקות ירוצו אופליין.

export interface LedgerEntry {
  key: string;
  /** מה חסר, בניסוח שבעל העסק מזהה כשאלה שנשאל */
  label: string;
  /** מה זה פותח. משפט קונקרטי על התנהגות אמיתית של המוצר, בלי מספרים מומצאים */
  unlocks: string;
  known: boolean;
}

// שורת ההפסד האישית דורשת ששתי התשובות יתפרשו; שווי הלקוח הוא שדרוג ולא תנאי
// (loss-calc.ts, הכרעת מייסד 18.8). לכן לשתי הראשונות אותו unlocks, ולשלישית ניסוח אחר
const LOSS_UNLOCK = "בלי זה אין את שורת ההפסד האישית בדוח";

// שלושת חוקי ממד ה-process. הניסוח לא נוקב במספר נקודות בכוונה: points הוא משקל בתוך הממד,
// והממד עצמו משוקלל בציון הכולל - "40 נקודות בציון" היה מספר לא נכון, וזה בדיוק סוג ההחלקה
// שכלל אפס-מספרים-מומצאים אוסר. מה שנכון ומספיק: החוק לא נכנס למכנה, כלומר הציון לא מודד
// את החלק הזה בכלל (engine.ts: score = earnedPts / knownPts)
const PROCESS_LABEL: Record<string, { label: string; unlocks: string }> = {
  lead_handling: {
    label: "איך מטפלים אצלכם בפניות",
    unlocks: "בלי זה הציון לא מודד את הטיפול בפניות בכלל",
  },
  manual_tasks: {
    label: "אילו משימות ידניות חוזרות אצלכם",
    unlocks: "בלי זה הציון לא מודד את העבודה הידנית בכלל",
  },
  internal_tools: {
    label: "באילו כלים ומערכות אתם עובדים",
    unlocks: "בלי זה הציון לא מודד את הכלים הפנימיים בכלל",
  },
};

/**
 * הפנקס המלא, בסדר קבוע: קודם מה שפותח את שורת ההפסד (הדבר בעל הערך הגבוה ביותר בדוח),
 * אחריו מה שפותח מדידה בציון, ובסוף הענף. הסדר קבוע ולא לפי מצב - רשימה שמשנה סדר בין
 * טעינות קשה לקריאה, והמיון לפי "מה שנותר קודם" נעשה בתצוגה.
 */
export function buildLedger(
  findings: ScanFindings,
  model: BusinessModel | null,
  answers: QuantityAnswers,
): LedgerEntry[] {
  const entries: LedgerEntry[] = [
    {
      key: "loss_volume",
      label: "כמה פניות מגיעות לעסק בשבוע",
      unlocks: LOSS_UNLOCK,
      known: isKnownVolume(answers.volume),
    },
    {
      key: "loss_response_time",
      label: "תוך כמה זמן אתם חוזרים ללקוח",
      unlocks: LOSS_UNLOCK,
      known: isKnownResponseTime(answers.responseTime),
    },
    {
      key: "loss_deal_value",
      label: "כמה שווה אצלכם לקוח בממוצע",
      unlocks: "מוסיף לשורת ההפסד את הסכום שאתם נתתם",
      known: isKnownDealValue(answers.dealValue),
    },
  ];

  // הרשומות של הציון נגזרות מהחוקים עצמם ולא מרשימה מקבילה: חוק שיורד מ-processRules
  // נעלם מהפנקס באותו רגע, בלי שמישהו יצטרך לזכור לעדכן כאן
  for (const rule of processRules(model)) {
    const text = PROCESS_LABEL[rule.key];
    if (text == null) continue; // חוק חדש בלי ניסוח - לא ממציאים לו כותרת, פשוט לא מוצג
    entries.push({
      key: `score_${rule.key}`,
      label: text.label,
      unlocks: text.unlocks,
      known: rule.known(findings),
    });
  }

  entries.push({
    key: "industry",
    label: "באיזה ענף העסק פועל",
    // "לא זוהה נשאר לא זוהה" (industry.ts, הכרעה 6.1): עסק ב-unknown רואה פריטים כלליים
    // בלבד. זו התנהגות אמיתית של מנוע ההתאמה, לא הבטחה
    unlocks: "בלי זה נציע רק פריטים כלליים, בלי מה שמתאים דווקא לענף שלכם",
    known: industryOf(findings, model).slug !== "unknown",
  });

  return entries;
}

export const missingCount = (entries: LedgerEntry[]): number =>
  entries.filter((e) => !e.known).length;
