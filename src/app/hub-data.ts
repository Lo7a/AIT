import { cookies } from "next/headers";
import { prisma } from "../server/db";
import { listRecentDiagnoses, type DiagnosisListItem } from "../server/diagnosis-read";
import { currentActingUser, hasAuthConfig } from "../server/auth/supabase-server";
import { isImpersonating } from "../server/auth/impersonation";
import { isAdmin } from "../server/auth/guard";
import { HAS_REPORT_STATUSES } from "../server/status";
import { THEME_COOKIE, parseTheme } from "./theme";
import { getVariant } from "./variants/registry";

// טעינת מסך הבית, במקום אחד. שני מסלולים צורכים אותה: "/" שמפנה את המשתמש לעסק שלו,
// ו-"/hub" שהוא מרכז העסק עצמו. בלי המודול הזה אותה שאילתה ואותה בדיקת הרשאה היו
// נכתבות פעמיים ומתפצלות בתיקון הראשון (כלל השימוש החוזר ב-CLAUDE.md).

export interface HubProps {
  recent: DiagnosisListItem[];
  session: { email: string | null } | null;
  loginEnabled: boolean;
  isAdminUser: boolean;
  impersonating: { email: string | null } | null;
}

export type HubLoad =
  // אנונימי בסביבה עם התחברות: דף הנחיתה, לא מרכז העסק (הכרעת מייסד 16.8)
  | { kind: "landing" }
  | { kind: "hub"; props: HubProps; openDiagnosisId?: string };

export async function loadHub(): Promise<HubLoad> {
  // הזהות הפועלת: בהתחזות user הוא המשתמש שצופים בו, actor הוא האדמין
  const acting = await currentActingUser(prisma);
  const user = acting?.user ?? null;

  if (user == null && hasAuthConfig()) return { kind: "landing" };

  // הרשימה מתוחמת בעלות: אדמין רואה הכול, משתמש רגיל רק את העסקים שלו.
  // user null כאן = מצב טרום-מפתחות בלבד
  const [recent, cookieStore] = await Promise.all([
    listRecentDiagnoses(prisma, user != null && !isAdmin(user) ? { ownerUserId: user.id } : {}),
    cookies(),
  ]);
  // נשמר כדי ש-getVariant יישאר בידי הקורא בלי שיצטרך לקרוא את העוגייה בעצמו
  void parseTheme(cookieStore.get(THEME_COOKIE)?.value);

  return {
    kind: "hub",
    props: {
      recent,
      session: user != null ? { email: user.email } : null,
      loginEnabled: hasAuthConfig(),
      isAdminUser: user != null && isAdmin(user),
      impersonating: acting != null && isImpersonating(acting) ? { email: acting.user.email } : null,
    },
    // האבחון שאליו נכנסים כברירת מחדל: הראשון ברשימה שכבר יש לו דוח
    openDiagnosisId: recent.find((d) => HAS_REPORT_STATUSES.includes(d.status))?.id,
  };
}

export async function hubVariant() {
  const cookieStore = await cookies();
  return getVariant(parseTheme(cookieStore.get(THEME_COOKIE)?.value));
}
