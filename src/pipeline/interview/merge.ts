import {
  completenessOf, type BusinessModel, type FieldSource, type ModelSection,
} from "../model/business-model";
import type { ExtractedUpdate } from "./extract";

// מיזוג טהור של עדכוני ראיון למודל: ערכי ראיון גוברים על ערכי סריקה באותו שדה
// (בעל העסק הוא המקור הסמכותי), קרדיט הסקציה עולה ל-1, והשלמות מחושבת מחדש
export function applyInterviewUpdates(
  model: BusinessModel,
  updates: ExtractedUpdate[],
  source: Extract<FieldSource, "interview" | "free_text">,
): BusinessModel {
  const data = Object.fromEntries(
    Object.entries(model.data).map(([k, v]) => [k, { ...v }]),
  ) as BusinessModel["data"];
  const credits = { ...model.credits };
  const fieldSources: BusinessModel["fieldSources"] = Object.fromEntries(
    Object.entries(model.fieldSources).map(([k, v]) => [k, [...(v ?? [])]]),
  );

  for (const u of updates) {
    const section = u.section as ModelSection;
    data[section] = { ...data[section], ...u.fields };
    credits[section] = 1;
    const sources = fieldSources[section] ?? [];
    if (!sources.includes(source)) sources.push(source);
    fieldSources[section] = sources;
  }

  return { data, credits, fieldSources, completenessPct: completenessOf(credits) };
}
