// אנדפוינט זעיר: סטטוס נוכחי של אבחון. שני מסלולים:
// - ?id=  נצרך ע"י מסך הסריקה במצב "attach" (רענון שמתחבר לסריקה קיימת).
// - ?placeId= / ?url=  נצרך ע"י מסך "רצה בחלון אחר" (blocked): הלקוח שם לא מכיר diagnosisId -
//   רק את היעד - ובלי המסלול הזה המסך היה סטטי לנצח גם אחרי שהדוח מוכן (באג קמפאי 15.8).
//   מחזיר גם id כדי שהלקוח יוכל לנווט לדוח.
export interface StatusByTarget { diagnosisId: string; status: string }

export function makeStatusHandler(
  getStatus: (id: string) => Promise<string | null>,
  findByTarget?: (target: { placeId?: string; url?: string }) => Promise<StatusByTarget | null>,
) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (id) {
      const status = await getStatus(id);
      if (status == null) return Response.json({ error: "אבחון לא נמצא" }, { status: 404 });
      return Response.json({ status });
    }
    const placeId = url.searchParams.get("placeId") ?? undefined;
    const targetUrl = url.searchParams.get("url") ?? undefined;
    if (findByTarget && (placeId || targetUrl)) {
      const found = await findByTarget({ placeId, url: targetUrl });
      if (found == null) return Response.json({ error: "אבחון לא נמצא" }, { status: 404 });
      return Response.json({ status: found.status, id: found.diagnosisId });
    }
    return Response.json({ error: "חסר מזהה אבחון" }, { status: 400 });
  };
}
