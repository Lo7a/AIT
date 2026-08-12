// שם קובץ בטוח: משאיר עברית, מוריד תווים אסורים ב-Windows/Unix
export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[\u200E\u200F\u202A-\u202E\u0000-\u001F]/g, "")
    .replace(/["'`]/g, "")
    .replace(/[\\/:*?<>|]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "business";
}
