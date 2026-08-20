import { loadHub, hubVariant } from "../hub-data";
import { LandingScreen } from "../landing-screen";

export const dynamic = "force-dynamic"; // הרשימה חייבת להיות טרייה - בלי קאש סטטי

// מרכז העסק: חיפוש עסק חדש והאבחונים האחרונים. יושב בנתיב משלו כדי ש-"/" יוכל
// להפנות את המשתמש ישר לעסק שלו בלי שהמסך הזה ייעלם מהמערכת (הכרעת מייסד 19.8)
export default async function HubPage() {
  const loaded = await loadHub();
  if (loaded.kind === "landing") return <LandingScreen />;
  const { Home } = await hubVariant();
  return <Home {...loaded.props} />;
}
