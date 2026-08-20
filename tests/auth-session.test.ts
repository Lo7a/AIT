import { describe, expect, it } from "vitest";
import { getSessionUser, devAuthClaims, DEV_AUTH_SUB, DEV_AUTH_EMAIL, type AuthClaims } from "../src/server/auth/session";
import { makeFakeDb } from "./fakes/fake-db";

// שכבת הסשן (auth/session.ts): התפר היחיד בין Supabase Auth לטבלת המראה users - כל
// הלוגיקה כאן אופליין עם fake-db ו-claims מוזרקים, בלי Supabase אמיתי

const CLAIMS: AuthClaims = { sub: "11111111-1111-1111-1111-111111111111", email: "owner@example.com" };
const claimsOf = (c: AuthClaims | null) => async () => c;

describe("getSessionUser", () => {
  it("בלי סשן (claims null) - מחזיר null ולא נוגע בטבלה", async () => {
    const { db, users } = makeFakeDb();
    expect(await getSessionUser(db, claimsOf(null))).toBeNull();
    expect(users).toHaveLength(0);
  });

  it("כניסה ראשונה יוצרת שורת מראה עם authId, email ו-role ברירת מחדל owner", async () => {
    const { db, users } = makeFakeDb();
    const user = await getSessionUser(db, claimsOf(CLAIMS));
    expect(user).not.toBeNull();
    expect(user!.authId).toBe(CLAIMS.sub);
    expect(user!.email).toBe(CLAIMS.email);
    expect(user!.role).toBe("owner");
    expect(users).toHaveLength(1);
  });

  it("כניסה חוזרת מוצאת את אותה שורה - בלי כפילות", async () => {
    const { db, users } = makeFakeDb();
    const first = await getSessionUser(db, claimsOf(CLAIMS));
    const second = await getSessionUser(db, claimsOf(CLAIMS));
    expect(second!.id).toBe(first!.id);
    expect(users).toHaveLength(1);
  });

  it("שורה שנזרעה מראש לפי email (אדמין ראשון) נתבעת בכניסה הראשונה ושומרת role", async () => {
    const { db, users } = makeFakeDb();
    users.push({
      id: "user-seeded", authId: null, email: CLAIMS.email, role: "admin",
      createdAt: new Date(), updatedAt: new Date(),
    });
    const user = await getSessionUser(db, claimsOf(CLAIMS));
    expect(user!.id).toBe("user-seeded");
    expect(user!.authId).toBe(CLAIMS.sub);
    expect(user!.role).toBe("admin");
    expect(users).toHaveLength(1);
  });

  it("שורה עם email תפוס אבל authId אחר לא נתבעת - נוצרת שורה חדשה בלי email מתנגש", async () => {
    // מקרה קצה: מישהו אחר כבר מחזיק את השורה עם האימייל הזה (authId שלו מולא). המשתמש החדש
    // לא מקבל אותה - הוא נוצר כשורה נפרדת; ה-create נופל על ייחודיות email ולכן נדרש ש-fallback
    // המרוץ לא ימצא שורה לפי authId ויעלה את השגיאה האמיתית
    const { db, users } = makeFakeDb();
    users.push({
      id: "user-taken", authId: "22222222-2222-2222-2222-222222222222", email: CLAIMS.email,
      role: "owner", createdAt: new Date(), updatedAt: new Date(),
    });
    await expect(getSessionUser(db, claimsOf(CLAIMS))).rejects.toThrow("ייחודיות");
    expect(users).toHaveLength(1);
  });

  it("שינוי אימייל בצד Supabase מסתנכרן לשורה הקיימת", async () => {
    const { db, users } = makeFakeDb();
    await getSessionUser(db, claimsOf(CLAIMS));
    const updated = await getSessionUser(db, claimsOf({ ...CLAIMS, email: "new@example.com" }));
    expect(updated!.email).toBe("new@example.com");
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("new@example.com");
  });

  it("כשל סנכרון אימייל (החדש תפוס בשורה אחרת) לא מפיל את הבקשה - חוזרת השורה כמו שהיא", async () => {
    const { db, users } = makeFakeDb();
    users.push({
      id: "user-other", authId: "33333333-3333-3333-3333-333333333333", email: "new@example.com",
      role: "owner", createdAt: new Date(), updatedAt: new Date(),
    });
    await getSessionUser(db, claimsOf(CLAIMS));
    const user = await getSessionUser(db, claimsOf({ ...CLAIMS, email: "new@example.com" }));
    expect(user).not.toBeNull();
    expect(user!.email).toBe(CLAIMS.email);
  });

  it("מרוץ יצירה: השורה נוצרה בין הבדיקה ליצירה - הקריאה החוזרת לפי authId מחזירה אותה", async () => {
    const { db, users } = makeFakeDb();
    // מדמה את הבקשה המקבילה: עוטפים את findUnique כך שברגע הראשון הוא מחזיר null (כאילו
    // השורה עוד לא קיימת), ואז שותלים את השורה לפני ה-create - שנופל על ייחודיות ומפעיל
    // את מסלול ההחלמה
    const original = db.user.findUnique.bind(db.user);
    let missOnce = true;
    db.user.findUnique = async (args: { where: { authId?: string } }) => {
      if (missOnce && args.where.authId != null) {
        missOnce = false;
        users.push({
          id: "user-raced", authId: CLAIMS.sub, email: CLAIMS.email, role: "owner",
          createdAt: new Date(), updatedAt: new Date(),
        });
        return null;
      }
      return original(args);
    };
    const user = await getSessionUser(db, claimsOf(CLAIMS));
    expect(user!.id).toBe("user-raced");
    expect(users).toHaveLength(1);
  });
});

// מעקף אימות לפיתוח מקומי (20.8). זו שכבת אבטחה, ולכן ההכרעה טהורה ונבדקת -
// ובמיוחד הכיוון השלילי: מתי המעקף **לא** נדלק
describe("devAuthClaims - local development bypass", () => {
  it("is off when the flag is absent", () => {
    expect(devAuthClaims({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBeNull();
  });

  it("is on in development with an explicit flag", () => {
    for (const flag of ["1", "owner"]) {
      const claims = devAuthClaims({ NODE_ENV: "development", AIT_DEV_AUTH_BYPASS: flag } as NodeJS.ProcessEnv);
      expect(claims).toEqual({ sub: DEV_AUTH_SUB, email: DEV_AUTH_EMAIL });
    }
  });

  // הבדיקה החשובה ביותר בקובץ: גם אם המשתנה דלף להגדרות הייצור, המעקף מת
  it("is OFF in production even when the flag is explicitly set", () => {
    expect(devAuthClaims({ NODE_ENV: "production", AIT_DEV_AUTH_BYPASS: "1" } as NodeJS.ProcessEnv)).toBeNull();
    expect(devAuthClaims({ NODE_ENV: "production", AIT_DEV_AUTH_BYPASS: "owner" } as NodeJS.ProcessEnv)).toBeNull();
  });

  it("does not guess at truthy-looking values", () => {
    for (const flag of ["true", "yes", "on", "0", "", "admin", "ADMIN"]) {
      expect(devAuthClaims({ NODE_ENV: "development", AIT_DEV_AUTH_BYPASS: flag } as NodeJS.ProcessEnv)).toBeNull();
    }
  });

  // הבדיקה שהייתה תופסת את הבאג האמיתי: users.authId הוא @db.Uuid, ו-Postgres דוחה
  // כל מחרוזת שאינה UUID בשגיאת המרה. ה-fake-db לא אוכף טיפוסים, ולכן האילוץ נאכף כאן
  it("uses a valid UUID as the identity - users.authId is a uuid column", () => {
    const claims = devAuthClaims({ NODE_ENV: "development", AIT_DEV_AUTH_BYPASS: "1" } as NodeJS.ProcessEnv);
    expect(claims!.sub).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("keeps a stable identity so ownership survives a restart", () => {
    const a = devAuthClaims({ NODE_ENV: "development", AIT_DEV_AUTH_BYPASS: "1" } as NodeJS.ProcessEnv);
    const b = devAuthClaims({ NODE_ENV: "test", AIT_DEV_AUTH_BYPASS: "1" } as NodeJS.ProcessEnv);
    expect(a!.sub).toBe(b!.sub);
  });

  // המעקף מזין את אותו getSessionUser האמיתי - כלומר נוצרת שורת users רגילה, עם התפקיד
  // הרגיל, והבעלות והתיחום עובדים בדיוק כמו למשתמש אמיתי. שום לוגיקה לא נעקפת מלבד הזהות
  it("feeds the real session path and creates an ordinary user row", async () => {
    const { db } = makeFakeDb();
    const user = await getSessionUser(db, async () =>
      devAuthClaims({ NODE_ENV: "development", AIT_DEV_AUTH_BYPASS: "1" } as NodeJS.ProcessEnv),
    );
    expect(user).not.toBeNull();
    expect(user!.authId).toBe(DEV_AUTH_SUB);
    expect(user!.email).toBe(DEV_AUTH_EMAIL);
    expect(user!.role).toBe("owner"); // ברירת המחדל של הסכמה - לא אדמין
  });
});
