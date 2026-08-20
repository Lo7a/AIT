// עימוד משותף לכל שאילתות הניהול. טיפוס אחד ופונקציה אחת, כי חמישה מסכים מעמדים
// והחמישה חייבים להתנהג זהה - חמש גרסאות של אותו חישוב היו נבדלות זו מזו בעיגול
// הראשון, וכל מסך היה מציג "עמוד 4 מתוך 3" בנסיבות קצת אחרות.

export interface Paged<T> {
  rows: T[];
  /** סך התוצאות התואמות, לא רק בעמוד הזה */
  total: number;
  page: number;
  pages: number;
  perPage: number;
}

export interface PageRequest {
  page?: number;
  perPage?: number;
}

export interface PageWindow {
  page: number;
  perPage: number;
  skip: number;
  take: number;
}

/**
 * גבולות בטוחים לעימוד. שני החסמים מכוונים ולא הגנתיים-סתם: perPage מגיע מה-URL,
 * ובלי תקרה כל אחד היה יכול לבקש 100000 שורות ולמשוך את כל הטבלה בבקשה אחת.
 */
export function pageWindow(req: PageRequest, fallbackPerPage = 25, maxPerPage = 100): PageWindow {
  const perPage = Math.min(Math.max(Math.trunc(req.perPage ?? fallbackPerPage) || fallbackPerPage, 1), maxPerPage);
  const page = Math.max(Math.trunc(req.page ?? 1) || 1, 1);
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}

/** עטיפת התוצאה. pages לעולם לא קטן מ-1, כדי ש"עמוד 1 מתוך 0" לא יוצג על טבלה ריקה */
export function paged<T>(rows: T[], total: number, w: PageWindow): Paged<T> {
  return {
    rows,
    total,
    page: w.page,
    perPage: w.perPage,
    pages: Math.max(Math.ceil(total / w.perPage), 1),
  };
}

/** קריאת מספר עמוד מפרמטר URL. כל דבר שאינו מספר חיובי הוא עמוד 1 */
export function pageParam(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
