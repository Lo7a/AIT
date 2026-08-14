"use client";

import { useRouter } from "next/navigation";
import { THEMES, THEME_LABEL, THEME_COOKIE, type ThemeId } from "./theme";

// רכיב זמני בלבד עבור המייסד לצורך בחירת גרסת עיצוב - יוסר לגמרי לאחר שנבחרת
// הגרסה הסופית מבין שלוש הגרסאות. לא לבנות עליו תלות ארוכת טווח.
export function ThemeSwitcher({ active }: { active: ThemeId }) {
  const router = useRouter();

  function choose(id: ThemeId) {
    document.cookie = `${THEME_COOKIE}=${id}; path=/; max-age=31536000`;
    router.refresh();
  }

  return (
    <div
      role="group"
      aria-label="בחירת גרסת עיצוב"
      className="fixed bottom-4 left-4 z-50 flex gap-1 rounded-full bg-black/70 p-1 text-white shadow-lg backdrop-blur-md"
    >
      {THEMES.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => choose(id)}
          aria-label={`עבור לגרסת עיצוב ${THEME_LABEL[id]}`}
          aria-pressed={active === id}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            active === id ? "bg-white text-black" : "text-white/80 hover:bg-white/20"
          }`}
        >
          {THEME_LABEL[id]}
        </button>
      ))}
    </div>
  );
}
