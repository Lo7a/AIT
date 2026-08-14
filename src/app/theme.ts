// שכבת גרסאות עיצוב (theme variants) - server-safe, בלי תלות ב-DOM/cookies בפועל כאן.
// שלושה קונספטים חזותיים רדיקליים שהמייסד בוחר ביניהם; הפלט של הפונקציה כאן נקרא
// גם בשרת (layout, route files) וגם בלקוח (theme-switcher).
export const THEMES = ["modern", "dark", "vivid"] as const;
export type ThemeId = (typeof THEMES)[number];

export const THEME_LABEL: Record<ThemeId, string> = {
  modern: "מודרני בהיר",
  dark: "כהה פרימיום",
  vivid: "דשבורד חי",
};

export const THEME_COOKIE = "ait-theme";

export function parseTheme(v: string | undefined): ThemeId {
  return (THEMES as readonly string[]).includes(v ?? "") ? (v as ThemeId) : "modern";
}
