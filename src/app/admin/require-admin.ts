import { notFound, redirect } from "next/navigation";
import { prisma } from "../../server/db";
import { currentActingUser } from "../../server/auth/supabase-server";
import { isAdmin } from "../../server/auth/guard";
import type { ActingUser } from "../../server/auth/impersonation";

// השער של כל מסכי הניהול, במקום אחד. אדמין בלבד; לכל אחד אחר העמוד "לא קיים" (notFound,
// לא 403) - אין מה להסגיר. אנונימי מופנה לכניסה כמו בכל המסכים.
// השער נבדק לפי הזהות האמיתית (actor): אדמין באמצע התחזות לא מאבד את עמוד הניהול - ממנו
// הוא גם עוצר את ההתחזות.
// כל עמוד קורא לזה בעצמו ולא נשען רק על ה-layout: ניווט צד-לקוח בין מסכי הניהול לא מריץ
// מחדש layout משותף, ושער שרץ פעם אחת בכניסה הוא שער שאפשר לעקוף
export async function requireAdmin(): Promise<ActingUser> {
  const acting = await currentActingUser(prisma);
  if (acting == null) redirect("/login");
  if (!isAdmin(acting.actor)) notFound();
  return acting;
}
