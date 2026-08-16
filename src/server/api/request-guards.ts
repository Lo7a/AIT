// שומרי בקשה לכל מסלולי ה-POST (חבילת הגנת ה-API, אבן דרך "לצאת החוצה"):
// 1. בדיקת Origin - הגנת CSRF: דפדפן ששולח POST ממקור אחר (אתר זדוני שמנצל את ה-cookie של
//    המשתמש) נחסם. Origin חסר (כלי CLI, curl, דפדפנים ישנים) עובר - זו שכבת עומק מעל
//    SameSite=Lax של ה-cookies, לא השכבה היחידה.
// 2. אכיפת content-type - מסלול שמפרסר JSON דורש application/json מוצהר; מונע גם שליחות
//    טופס-פשוט חוצות-אתר (שעוקפות preflight) וגם באגים שקטים של לקוחות שטועים בכותרת.
// טהור לחלוטין (Request in, Response|null out) - נבדק אופליין בלי שום שרת.

export interface RequestGuardOptions {
  // המסלול קורא גוף JSON (req.json) - לאכוף את הכותרת המתאימה
  requireJson?: boolean;
}

// null = הבקשה עוברת; אחרת - תשובת הסירוב המוכנה
export function guardApiRequest(req: Request, opts: RequestGuardOptions = {}): Response | null {
  const origin = req.headers.get("origin");
  if (origin != null && origin !== "null") {
    const host = req.headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null; // Origin לא-תקני = חשוד, נופל לסירוב למטה
    }
    if (host == null || originHost !== host) {
      return Response.json({ error: "הבקשה נדחתה" }, { status: 403 });
    }
  }
  // "null" (opaque origin - למשל iframe sandboxed או קובץ מקומי) הוא לא המסך שלנו - נחסם גם
  if (origin === "null") {
    return Response.json({ error: "הבקשה נדחתה" }, { status: 403 });
  }

  if (opts.requireJson) {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return Response.json({ error: "הבקשה חייבת להישלח כ-JSON" }, { status: 415 });
    }
  }
  return null;
}
