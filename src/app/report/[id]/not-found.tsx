import { EmptyState } from "../../ui/empty-state";

export default function ReportNotFound() {
  return (
    <EmptyState
      title="האבחון לא נמצא"
      body="ייתכן שהקישור שגוי או שהאבחון עדיין לא הושלם."
    />
  );
}
