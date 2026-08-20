import { redirect } from "next/navigation";
import { loadHub, hubVariant } from "./hub-data";
import { LandingScreen } from "./landing-screen";

export const dynamic = "force-dynamic"; // הרשימה חייבת להיות טרייה - בלי קאש סטטי

// הכניסה למערכת נוחתת על העסק של המשתמש ולא על מסך חיפוש ריק (הכרעת מייסד 19.8):
// מי שכבר יש לו דוח מגיע ישר אליו, ומרכז העסק נשאר זמין תמיד ב-/hub ובסיידבר.
// מי שעדיין אין לו אבחון רואה את מרכז העסק כאן, כי אין לאן להפנות אותו.
export default async function HomePage() {
  const loaded = await loadHub();
  if (loaded.kind === "landing") return <LandingScreen />;

  // redirect זורק - חייב להיות מחוץ לכל try/catch (חוזה next/navigation)
  if (loaded.openDiagnosisId != null) redirect(`/report/${loaded.openDiagnosisId}`);

  const { Home } = await hubVariant();
  return <Home {...loaded.props} />;
}
