export type FetchLike = typeof fetch;

// עטיפה קשורה (bound) כדי שלא יישבר בהרצה בדפדפן/Next.js בעתיד
export const defaultFetch: FetchLike = (...args) => fetch(...args);

// קריאת גוף שגיאה בבטחה: לעולם לא זורק, קצוץ ל-500 תווים
export async function readErrorBody(res: Response): Promise<string> {
  return (await res.text().catch(() => "")).slice(0, 500);
}
