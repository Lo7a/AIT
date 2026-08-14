import {
  completenessOf, type BusinessModel, type FieldSource,
} from "../model/business-model";
import type { ExtractedUpdate } from "./extract";

// מיזוג טהור של עדכוני ראיון למודל: ערכי ראיון גוברים על ערכי סריקה באותו שדה
// (בעל העסק הוא המקור הסמכותי), קרדיט הסקציה עולה ל-1, והשלמות מחושבת מחדש
export function applyInterviewUpdates(
  model: BusinessModel,
  updates: ExtractedUpdate[],
  source: Extract<FieldSource, "interview" | "free_text">,
): BusinessModel {
  // structuredClone ולא Object.fromEntries רדוד - שדות שהם מערכים (כמו tools.detected)
  // לא יישארו רפרנס משותף עם המודל המקורי
  const data = structuredClone(model.data);
  const credits = { ...model.credits };
  const fieldSources: BusinessModel["fieldSources"] = Object.fromEntries(
    Object.entries(model.fieldSources).map(([k, v]) => [k, [...(v ?? [])]]),
  );

  for (const u of updates) {
    data[u.section] = { ...data[u.section], ...u.fields };
    credits[u.section] = 1;
    const sources = fieldSources[u.section] ?? [];
    if (!sources.includes(source)) sources.push(source);
    fieldSources[u.section] = sources;
  }

  return { data, credits, fieldSources, completenessPct: completenessOf(credits) };
}
