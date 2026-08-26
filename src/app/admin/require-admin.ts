import { notFound, redirect } from "next/navigation";
import { prisma } from "../../server/db";
import { currentActingUser } from "../../server/auth/supabase-server";
import { isAdmin } from "../../server/auth/guard";
import type { ActingUser } from "../../server/auth/impersonation";

// השער של כל מסכי הניהול, במקום אחד. אדמין בלבד; לכל אחד אחר העמוד "לא קיים" (notFound,
// לא 403) - אין מה להסגיר. אנונימי מופנה לכניסה כמו בכל המסכים.
// שתי בדיקות בכוונה (הכרעת מייסד 24.8 - הדמיה מלאה):
// 1. הזהות האמיתית חייבת להיות אדמין - אבטחה, לא משתנה לעולם.
// 2. גם הזהות המדומה חייבת להיות אדמין - אדמין שמתחזה לבעל עסק מקבל "לא קיים" בדיוק
//    כמו שבעל העסק היה מקבל. זו הנקודה של ההתחזות: QA של מה שהמשתמש באמת רואה.
//    היציאה מההתחזות אינה תלויה במסך הזה - פס ההתחזות במסכי העסק עוצר אותה.
// כל עמוד קורא לזה בעצמו ולא נשען רק על ה-layout: ניווט צד-לקוח בין מסכי הניהול לא מריץ
// מחדש layout משותף, ושער שרץ פעם אחת בכניסה הוא שער שאפשר לעקוף
export async function requireAdmin(): Promise<ActingUser> {
  const acting = await currentActingUser(prisma);
  if (acting == null) redirect("/login");
  if (!isAdmin(acting.actor)) notFound();
  if (!isAdmin(acting.user)) notFound();
  return acting;
}
