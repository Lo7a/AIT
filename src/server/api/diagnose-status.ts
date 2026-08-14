// אנדפוינט זעיר: סטטוס נוכחי של אבחון בודד. נצרך ע"י מסך הסריקה במצב "attach" (Fix 2 - כשרענון
// מתחבר לסריקה קיימת) כדי לדעת מתי היא הגיעה ל-report_ready ולנווט לדוח בלי לפתוח זרם חדש.
export function makeStatusHandler(getStatus: (id: string) => Promise<string | null>) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "חסר מזהה אבחון" }, { status: 400 });
    const status = await getStatus(id);
    if (status == null) return Response.json({ error: "אבחון לא נמצא" }, { status: 404 });
    return Response.json({ status });
  };
}
