# AIT - Design Brief for External Tools

Copy-paste the prompt below into any AI design tool (v0, Lovable, Figma Make, etc.). It contains the full product context, all three screens, and the real Hebrew content. The output we need back is static HTML/CSS (or the tool's export) that we will convert into our Next.js app.

---

## The Prompt

Design a premium, top-tier web UI for "AIT" - a Hebrew, RTL (right-to-left) SaaS product that diagnoses the digital presence of small businesses in Israel. The user enters a business name or website URL, watches a live scan, and receives a scored diagnosis report. Think of it as a "digital health checkup" for a local business: barbershops, bakeries, plumbers, clinics.

Audience: Israeli small-business owners, non-technical. The product must build TRUST through design: professional, modern, confident, warm. It must NOT look like a generic AI-generated template.

Hard requirements:
- Entire UI in Hebrew, dir="rtl". Use a quality Hebrew-supporting font (Rubik, Heebo, Assistant, Secular One are on Google Fonts).
- No emojis anywhere in the UI. No em-dashes in text (regular hyphens only). The Hebrew copy below is final - use it verbatim where given.
- Modern, clean, high-end UX/UI. Visually rich - no empty sparse screens - but disciplined, not cluttered.
- Desktop-first (1280px+), should not break at 1000px.

The product has THREE screens:

### Screen 1 - Entry
Purpose: one magic field, zero friction.
- Big headline (you may write it, human Hebrew, no cliches) + short subtitle about getting an honest picture of the business's digital presence in one minute.
- ONE input field: "שם העסק או כתובת האתר" + optional small city field "עיר (לא חובה)" + primary CTA button "אבחן את העסק שלי".
- When a name matches several businesses on Google, a compact candidate picker appears (business name, address, star rating).
- A "how it works" strip with 3 steps: 1 "מזינים שם עסק או כתובת אתר" 2 "סריקה חכמה של הנוכחות הדיגיטלית" 3 "דוח מפורט עם ציון והמלצות".
- Trust hints: "אבחון ראשוני חינם", "בלי התחייבות", "תוך דקה".
- A "recent diagnoses" list: אופטיקה בק בע"מ 73/100 (דוח מוכן), בית מאפה ברכת רחל 84/100 (דוח מוכן), lavangroup.co.il 63/100 (דוח מוכן).

### Screen 2 - Live Scan
Purpose: the "magic moment" - the user watches the system work in real time (takes 20-90 seconds).
- Title: "מאבחנים את אופטיקה בק בע"מ" + subtitle "בדרך כלל זה לוקח פחות מדקה".
- Progress lines appear one by one, each with a state indicator (in-progress spinner/pulse, then success check or failure mark) and a small detail line:
  1. "מאתרים את פרטי העסק בגוגל" -> "נמצאו 80 ביקורות ודירוג 4.9"
  2. "קוראים את האתר" -> "נסרקו 8 עמודים"
  3. "בודקים מהירות טעינה במובייל" -> "ציון ביצועים 46"
  4. "מנתחים את הביקורות" -> "נותחו 5 ביקורות"
  5. "מחשבים ציונים ומודל עסק" -> "ציון כולל 73/100"
  6. "כותבים את הדוח"
  7. "שומרים את האבחון"
- Design the waiting experience: make it feel alive and premium (animation, motion), not a boring spinner.

### Screen 3 - The Report (the flagship screen, invest the most here)
Purpose: a paid-consultant-grade diagnosis the owner actually understands. Real content to use:
- Business: אופטיקה בק בע"מ, עפולה. Overall score: 73/100.
- Opening verdict (use verbatim): headline "לאופטיקה בק מוניטין מצוין עם דירוג של 4.9, אך תשתיות דיגיטליות חלקיות מגבילות את הפוטנציאל" and summary "העסק נהנה מ-80 ביקורות בדירוג 4.9 ומנוכחות דיגיטלית פעילה, אבל היעדר הזמנת תורים אונליין, פיקסל שיווקי ואתר איטי במובייל משאירים לקוחות ופניות על השולחן."
- Five dimension scores (visualize them - bars, rings, gauges, your call): נראות דיגיטלית 65 (מידע מלא) | מוניטין וביקורות 100 (מידע מלא) | נגישות ללקוח 70 (מידע מלא) | תשתית דיגיטלית 50 (מידע חלקי) | בשלות תהליכים - אין מידע (must be visibly "no data", NOT a zero).
- Top gaps (each with its evidence): "אין קביעת תורים אונליין - עסק שחי על תורים מפסיד לקוחות שרוצים לקבוע ב-22:00 בלילה" | "אין פיקסל שיווקי - אי אפשר לעשות רימרקטינג למבקרים באתר" | "האתר איטי במובייל - ציון ביצועים 46, טעינה 12.7 שניות".
- Strengths: "דירוג מצוין: 4.9 מ-80 ביקורות" | "וואטסאפ, טלפון וטופס יצירת קשר זמינים באתר" | "פרופיל גוגל פעיל ומלא".
- Transparency: every dimension score can be expanded ("איך חושב הציון?") to show the rule breakdown, e.g. for נגישות ללקוח: "וואטסאפ באתר +25, טלפון קליקבילי +20, טופס יצירת קשר +25, קביעת תורים אונליין 0 מתוך 30".
- Diagnosis completeness meter: 30%, with next step "ראיון קצר על טיפול בלידים ישלים את התמונה" and a primary CTA "רוצה דיוק גבוה יותר? ראיון של 5 דקות" (+ secondary "דלג ל-Roadmap").
- Small meta footer: scan duration 14.4 seconds, API cost $0.06.

Deliverable: all three screens as polished static HTML/CSS (single file or three files), RTL, self-contained.

---

## Notes for us (not part of the prompt)
- Compare external results against design/variant-modern.html, variant-dark.html, variant-vivid.html (our three in-house directions).
- Whatever wins gets converted into src/app/variants/<id>/ on top of the shared hooks (use-scan-stream, use-business-search) - the funnel logic never changes, presentation only.
