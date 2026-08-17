// העלאת ארטיפקטים לבאקט הפרטי scan-artifacts (Supabase Storage) - REST ישיר, בלי SDK נוסף.
// צד שרת בלבד: דורש SUPABASE_SECRET_KEY (המפתח הסודי, לעולם לא נשלח לדפדפן). כשל העלאה
// לא זורק החוצה - מחזיר false והקורא (offloadHeavyPayload ב-external-log.ts) נופל לחיתוך.
export async function uploadArtifact(path: string, bytes: Uint8Array, contentType: string): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) return false;
  try {
    const res = await fetch(`${base}/storage/v1/object/scan-artifacts/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        apikey: key,
        "content-type": contentType,
      },
      body: bytes as unknown as BodyInit,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) console.error(`העלאת ארטיפקט נכשלה (${res.status}) - נופלים לחיתוך`);
    return res.ok;
  } catch (err) {
    console.error("העלאת ארטיפקט נכשלה - נופלים לחיתוך:", err instanceof Error ? err.message : err);
    return false;
  }
}
