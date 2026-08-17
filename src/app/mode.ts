// מצב תצוגה (כהה/בהיר) - נפרד ממערכת גרסאות העיצוב הישנה (theme.ts, נבחרה גרסה סופית).
// server-safe: נקרא גם ב-layout (עוגייה) וגם בלקוח (mode-toggle).
export const MODE_COOKIE = "ait-mode";
export const MODES = ["dark", "light"] as const;
export type ModeId = (typeof MODES)[number];

export function parseMode(v: string | undefined): ModeId {
  return v === "light" ? "light" : "dark";
}
