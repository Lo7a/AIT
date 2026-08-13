import type { ScanFindings } from "../types";

export type DataStatus = "full" | "partial" | "none";
export type DimensionKey =
  | "visibility" | "reputation" | "accessibility" | "infrastructure" | "process";

export interface RuleDef {
  key: string;
  points: number;
  known: (f: ScanFindings) => boolean;   // האם יש בכלל מידע לבדוק את החוק
  earned: (f: ScanFindings) => boolean;  // נבדק רק כאשר known
  gapText: (f: ScanFindings) => string;  // עברית — הפער, ננוסח לבעל העסק; נקרא רק כאשר known=true (כמו earned)
  okText: (f: ScanFindings) => string;   // עברית — מה תקין (אמינות = גם לפרגן); נקרא רק כאשר known=true (כמו earned)
}

export interface DimensionDef {
  key: DimensionKey;
  label: string;   // עברית לתצוגה
  weight: number;  // 0-1, סכום כל הממדים = 1
  rules: RuleDef[];
}

export interface RuleResult {
  key: string;
  points: number;
  known: boolean;
  earned: boolean;
  text: string; // okText אם הושג, gapText אם לא; "" אם לא ידוע
}

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  weight: number;
  score: number | null; // null = אין שום מידע לממד
  dataStatus: DataStatus;
  rules: RuleResult[];
}

export interface Highlight {
  dimension: DimensionKey;
  ruleKey: string;
  text: string;
  points: number;
}

export interface ScoreReport {
  overall: number | null; // null רק אם אין מידע לאף ממד
  dimensions: DimensionScore[];
  topGaps: Highlight[];      // עד 3, לפי נקודות אבודות
  topStrengths: Highlight[]; // עד 3, לפי נקודות שהושגו
}
