import type { DiagnoseEvent } from "../diagnose-events";

// לוגי מחזור חיים בצד שרת לבקשת המייסד: npm run dev לא הראה שום דבר בטרמינל בזמן שסריקה
// רצה בדפדפן, מה שהקשה לדעת אם היא בכלל התקדמה. שורה אחת קומפקטית לאירועי תחילה/סיום/שלב-הושלם/שגיאה
// (לא לכל אירוע גולמי - "step" עצמו מדולג בכוונה, ה-step_done שאחריו מספיק) עם חותמת זמן HH:MM:SS.
function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

export function logDiagnoseEvent(e: DiagnoseEvent): void {
  switch (e.type) {
    case "created":
      console.log(`[${ts()}] [diagnose ${e.diagnosisId.slice(0, 8)}] started: ${e.businessName}`);
      break;
    case "step":
      break;
    case "step_done":
      console.log(`[${ts()}] [diagnose] ${e.key} ${e.ok ? "ok" : "failed"}: ${e.detail ?? ""}`);
      break;
    case "done":
      console.log(`[${ts()}] [diagnose ${e.diagnosisId.slice(0, 8)}] report_ready`);
      break;
    case "error":
      console.error(`[${ts()}] [diagnose] error: ${e.message}`);
      break;
  }
}
