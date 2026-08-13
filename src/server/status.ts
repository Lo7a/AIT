// מכונת המצבים של אבחון (אפיון 9.4): כל מצב תקף בפני עצמו, הראיון לא חוסם
export const DIAGNOSIS_STATUSES = [
  "created", "scanning", "scanned", "report_ready", "interviewing", "roadmap_ready",
] as const;
export type DiagnosisStatus = (typeof DIAGNOSIS_STATUSES)[number];

const TRANSITIONS: Record<DiagnosisStatus, readonly DiagnosisStatus[]> = {
  created: ["scanning"],
  scanning: ["scanned", "created"], // created = הסריקה נכשלה, אפשר לנסות שוב
  scanned: ["report_ready"],
  report_ready: ["interviewing", "roadmap_ready"],
  interviewing: ["report_ready", "roadmap_ready"],
  roadmap_ready: ["interviewing"], // חזרה לראיון — ה-Roadmap מחושב מחדש אחריה
};

export function canTransition(from: DiagnosisStatus, to: DiagnosisStatus): boolean {
  // Object.hasOwn — כדי שמפתחות שירשו מהפרוטוטייפ ("toString", "__proto__") יחזירו false ולא יזרקו
  return Object.hasOwn(TRANSITIONS, from) && TRANSITIONS[from].includes(to);
}

export function assertTransition(from: DiagnosisStatus, to: DiagnosisStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`מעבר סטטוס לא חוקי: ${from} → ${to}`);
  }
}
