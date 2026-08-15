import type { RoadmapItemView } from "../../server/roadmap-repo";
import type { BusinessModel, ModelSection } from "../model/business-model";

// מחולל ה-Project Brief (אבן דרך 4, משימה 7): טהור לחלוטין ודטרמיניסטי - בלי LLM, בלי I/O,
// בלי Date/random. תבנית קבועה בעברית לפי סעיף 8 באפיון (docs/specs/ait-mvp-spec.md):
// 1. פרטי עסק + תקציר מודל  2. הבעיה  3. הפתרון והיקפו  4. מערכות קיימות  5. מחיר וזמן הטמעה
// 6. שאלות פתוחות. אותו קלט = אותו פלט תמיד. כל ספרה שמופיעה בתוצאה מגיעה אך ורק מ-string
// interpolation של שדות קטלוג/בנצ'מרקים/פרטי קשר של העסק - אף פעם לא מהמלל הקבוע של התבנית
// עצמה (עקרון "אפס מספרים מומצאים" באפיון). item.reasoning כבר מגיע נקי מספרות בחוזה של
// reasoning.ts - brief.ts רק מציג אותו כלשונו, לא עורך/מוסיף עליו ניסוח.

export interface BriefBusiness {
  name: string;
  city?: string;
  phone?: string;
  website?: string;
}

// שדות שמקורם בסריקה (deriveBusinessModel), לא בדיווח בעל העסק בפועל - "פלטפורמה שזוהתה
// אוטומטית" היא לא "מערכת קיימת" שהבעלים ציין. אותו עיקרון בדיוק כמו SCAN_DERIVED_KEYS
// ב-score/dimensions.ts, לא מיובא משם בכוונה - brief.ts טהור וללא תלות בשכבת הניקוד
const TOOLS_SCAN_DERIVED_KEYS = new Set(["platform", "detected"]);

function reportedTools(model: BusinessModel | null): string[] {
  const data = model?.data.tools ?? {};
  return Object.entries(data)
    .filter(([k, v]) => !TOOLS_SCAN_DERIVED_KEYS.has(k) && typeof v === "string" && v.trim().length > 0)
    .map(([, v]) => (v as string).trim());
}

// תוויות קבועות לתקציר "אילו תחומים יש עליהם מידע" בסעיף 1 - מציינות שם סקציה בלבד, לא
// מצטטות טקסט חופשי שהבעלים כתב (שעלול להכיל ספרה, למשל "יש לנו 3 סניפים"). profile לא ברשימה -
// תמיד יש בו משהו (שם/דומיין מהסריקה), אז ציון נפרד שלו לא מוסיף מידע רלוונטי לתקציר
const SUMMARY_SECTION_LABEL: Partial<Record<ModelSection, string>> = {
  channels: "ערוצי לקוחות",
  lead_flow: "טיפול בלידים",
  scheduling: "קביעת תורים",
  service: "שירות ותפעול",
  billing: "גבייה וחשבוניות",
  retention: "שימור לקוחות",
  tools: "כלים ומערכות",
  pains: "כאבים שדווחו",
  manual_tasks: "משימות ידניות",
};

function modelSummaryLine(model: BusinessModel | null): string {
  if (!model) {
    return "טרם בוצע ראיון עם בעל העסק - הפרטים הבאים מבוססים על ממצאי הסריקה הראשונית בלבד.";
  }
  const known = (Object.keys(SUMMARY_SECTION_LABEL) as ModelSection[])
    .filter((section) => (model.credits[section] ?? 0) >= 0.5)
    .map((section) => SUMMARY_SECTION_LABEL[section]);
  if (known.length === 0) {
    return "עדיין אין מידע נוסף על העסק מעבר לפרטים הבסיסיים מהסריקה.";
  }
  return `תחומים שיש עליהם מידע מהאבחון: ${known.join(", ")}.`;
}

function businessLines(business: BriefBusiness): string {
  const lines = [`עסק: ${business.name}`];
  if (business.city) lines.push(`עיר: ${business.city}`);
  if (business.phone) lines.push(`טלפון: ${business.phone}`);
  if (business.website) lines.push(`אתר: ${business.website}`);
  return lines.join("\n");
}

// חוזה reasoning.ts: המשפט תמיד נקי מספרות, ותמיד מעוגן-ציטוט (לא "לעסק חסר X") כשההתאמה
// מבוססת כאב-בלבד - brief.ts רק מעתיק אותו כלשונו, לא מנסח מחדש ולא מוסיף פסוקית משלו לפניו
// שעלולה לסתור את העיגון הזה. reasoning נשמר nullable בעמודת ה-DB (roadmap-repo.ts) - הנפילה
// הזו היא רשת ביטחון תיאורטית, לא מסלול צפוי בפועל
const NO_REASONING_FALLBACK = "המערכת זיהתה שההזדמנות הזו רלוונטית לעסק, בהתבסס על נתוני האבחון.";

function problemSection(item: RoadmapItemView): string {
  const reasoning = item.reasoning?.trim();
  return `${item.problem}\n\n${reasoning || NO_REASONING_FALLBACK}`;
}

function existingSystemsSection(model: BusinessModel | null): string {
  const tools = reportedTools(model);
  return tools.length === 0 ? "לא דווחו מערכות" : tools.map((t) => `- ${t}`).join("\n");
}

function priceAndTimeSection(item: RoadmapItemView): string {
  const lines = [
    `עלות: ${item.costRange}`,
    `חיסכון צפוי: ${item.savingRange}`,
    `זמן הטמעה: ${item.installTime}`,
  ];
  if (item.benchmarks.length > 0) {
    lines.push("בנצ'מרקים תומכים:");
    for (const b of item.benchmarks) lines.push(`- ${b.metric}: ${b.range} (מקור: ${b.source})`);
  }
  return lines.join("\n");
}

// שאלות פתוחות קבועות לפי שלב (Phase, opportunity-score.ts) - סטטיות וגלויות, לא LLM ב-MVP
// (האפיון, סעיף 8, סעיף 6 בתבנית). transformation אינו בשימוש היום (אף פריט קטלוג לא ממופה
// אליו - ראו opportunity-score.ts) אבל מוגדר במפורש כדי ש-buildBrief יישאר טוטאלי, לא ייפול
// אם/כשייכנס פריט transformation ראשון לקטלוג
const OPEN_QUESTIONS: Record<RoadmapItemView["phase"], string[]> = {
  quick_wins: [
    "מי מהצוות יהיה איש הקשר להטמעה הזו?",
    "יש כבר חשבון או פרופיל קיים שצריך להתחבר אליו, או שנפתח חדש?",
    "יש העדפה לתזמון ההטמעה, או שאפשר להתחיל מיד?",
  ],
  automation: [
    "אילו מערכות קיימות היום צריכות להתחבר לפתרון החדש?",
    "מי בצוות יהיה בעל הבית מול הספק לאורך ההטמעה?",
    "יש אילוצים טכניים או חוזים קיימים שכדאי לדעת עליהם מראש?",
  ],
  ai: [
    "אילו שאלות נפוצות מהלקוחות הכלי צריך לדעת לענות עליהן?",
    "מתי צריך להעביר את השיחה לאדם אמיתי במקום להמשיך אוטומטית?",
    "מי יאשר את הניסוחים והטון לפני שהכלי עולה לאוויר?",
  ],
  transformation: [
    "מהי התוצאה העסקית שהכי חשוב להשיג בתהליך הזה?",
    "אילו תהליכים קיימים היום ישתנו מהיסוד, ומי מושפע מהם?",
    "מה לוח הזמנים הרצוי מבחינת העסק לתהליך שינוי כזה?",
  ],
};

function openQuestionsSection(item: RoadmapItemView): string {
  return OPEN_QUESTIONS[item.phase].map((q) => `- ${q}`).join("\n");
}

export function buildBrief(item: RoadmapItemView, model: BusinessModel | null, business: BriefBusiness): string {
  return [
    `בקשת הטמעה: ${item.name}`,
    "",
    businessLines(business),
    modelSummaryLine(model),
    "",
    "הבעיה:",
    problemSection(item),
    "",
    "הפתרון והיקפו:",
    item.solution,
    "",
    "מערכות קיימות:",
    existingSystemsSection(model),
    "",
    "הערכת מחיר וזמן הטמעה:",
    priceAndTimeSection(item),
    "",
    "שאלות פתוחות לאיש המקצוע:",
    openQuestionsSection(item),
  ].join("\n");
}
