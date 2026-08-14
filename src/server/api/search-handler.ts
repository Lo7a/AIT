import type { BusinessCandidate } from "../../pipeline/types";

const MAX_CANDIDATES = 5; // תואם ל-MAX_LISTED_CANDIDATES של ה-CLI

// factory — ה-route מזריק את searchBusiness החי, הבדיקות מזריקות fake
export function makeSearchHandler(search: (q: string) => Promise<BusinessCandidate[]>) {
  return async function handle(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "גוף הבקשה חייב להיות JSON" }, { status: 400 });
    }
    const rawQuery = typeof body === "object" && body !== null && "query" in body
      ? (body as { query: unknown }).query
      : undefined;
    // typeof מחרוזת בלבד — מספר/אובייקט לא עוברים המרה שקטה ל-String (זה גוף בקשה, לא CLI)
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
    if (query.length < 2 || query.length > 120) {
      return Response.json({ error: "יש להזין שם עסק (2 עד 120 תווים)" }, { status: 400 });
    }
    try {
      const found = (await search(query)).slice(0, MAX_CANDIDATES);
      return Response.json({ candidates: found });
    } catch (err) {
      // טקסט שגיאת upstream הגולמי (עלול לכלול פרטי תשתית) נשמר בלוג בצד שרת בלבד;
      // ללקוח חוזרת הודעה גנרית (תואם את התבנית ב-diagnose-stream.ts)
      console.error("⚠️ חיפוש נכשל (פרטים בצד שרת בלבד):", err);
      return Response.json({ error: "החיפוש נכשל, נסו שוב בעוד רגע" }, { status: 502 });
    }
  };
}
