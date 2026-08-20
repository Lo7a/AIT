import { EmptyState } from "../../ui/empty-state";

export default function InterviewNotFound() {
  return (
    <EmptyState
      title="האבחון לא נמצא"
      body="ייתכן שהקישור שגוי, או שעדיין לא הסתיימה סריקה לעסק הזה."
    />
  );
}
