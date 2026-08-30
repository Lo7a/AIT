# הלקוח הסמוי (משימה 10) - עיצוב, as-built והקמה

הכרעת מייסד 30.8.2026: הערך הראשון בסולם ("הוכחה שהוא חווה בעצמו"). פנייה אמיתית כלקוח
בערוצים שיש לעסק, בהסכמת בעל העסק, שמודדת דבר אחד: אם ומתי ענו.

## מה בעל העסק חווה

1. בדוח, כרטיס "הלקוח הסמוי" עם כפתור "בדוק איך עונים אצלי". הלחיצה היא ההסכמה ונשמרת (מי, מתי).
2. בזמן ההמתנה: "הבדיקה בדרך" בלבד. בכוונה בלי מועד ובלי "נשלח": מי שיודע שהמייל יצא עונה עליו בעצמו.
3. התוצאה, ערוץ ערוץ, תמיד עם יום, שעה ומשך: "הלקוח הסמוי פנה במייל ביום שלישי בשעה 11:30 וקיבל
   תשובה אחרי 3 שעות ו-20 דקות". אף פעם לא שיעור - בדיקה אחת היא נקודה אחת.

## ערוצים

| ערוץ | איך | מי שולח |
|---|---|---|
| מייל | לכתובת mailto מהאתר, מכתובת בדיקה ייחודית probe-<token>@<דומיין>; התשובה חוזרת ל-webhook | המערכת |
| טופס באתר | איתור הטופס בעמוד הבית / "צור קשר", מילוי, POST בלי דפדפן. Wix/Elementor (JS) לא ניתנים לשליחה - "לא הצלחנו לשלוח דרך הטופס" | המערכת |
| וואטסאפ, טלפון | המערכת מתזמנת ומנסחת; מישהו מהחברה שולח מהטלפון של החברה ומתעד ב-/admin/mystery | ביד |

## כללים

- הסכמה מפורשת, פעם ב-30 יום לסבב. מועד אקראי בשעות הפתיחה מגוגל (או א-ה 10:00-16:00), בתוך שלושת
  חלונות הפעילות הקרובים, לא לפני שעה מהלחיצה. ממתינים 72 שעות לתשובה.
- חשיפה אחרי הסבב - תמיד: "הפנייה הקודמת הייתה בדיקת לקוח סמוי מטעם בדק עסק, בהזמנת בעל העסק".
- מהתשובה שומרים זמן וציטוט של עד 200 תווים. הגוף המלא ב-payload (כלל שימור מלא).
- הראיה נכתבת ל-scan.findings.mystery, והציון מחושב מחדש באותו מסלול כמו אחרי ראיון. חוק
  lead_handling: עובדה שנמדדה גוברת על הדיווח העצמי לשני הכיוונים. סף הזיכוי: שעה
  (HBR, The Short Life of Online Sales Leads, 2011) - פרמטר של חוק, לא מספר שמוצג.

## as-built (30.8)

- `src/pipeline/mystery/` - evidence (פסק וניסוח), schedule (שעון ישראל, חלונות), message (פרסונות,
  ניסוח לפי ענף, חשיפה), form (איתור ומילוי טופס, שליחה מוגנת SSRF).
- `src/pipeline/crawler/signals.ts` - contactEmail מ-mailto (אדיטיבי ב-WebsiteSignals). `fetchPage` מיוצא.
- `src/server/run-mystery.ts` - requestMysteryRun / tickMystery / recordInboundReply / adminMarkProbe /
  reportCompletedRuns / mysteryViewFor / listMysteryProbes. `src/server/mail.ts` - תובלת המייל
  (הוצאה מ-run-brief.ts) + fetchReceivedEmail. `src/server/mystery-webhook.ts` - אימות Svix.
- API: `POST /api/mystery/[id]` (הסכמה), `POST /api/mystery/tick` (x-tick-secret),
  `POST /api/mystery/inbound` (webhook Resend), `POST /api/admin/mystery` (הערוצים המסייעים).
- מסכים: `ui/mystery-card.tsx` בדוח, `/admin/mystery`.
- DB: טבלה `mystery_probes` (מיגרציה 20260830120000, אדיטיבית). אירועי יומן mystery_requested /
  mystery_reported; מגבלת קצב rate.mystery (5 לשעה).
- סביבה: MYSTERY_MAIL_DOMAIN, RESEND_WEBHOOK_SECRET, MYSTERY_TICK_SECRET (ראו .env.example).

## הקמה (ידי המייסדים)

1. **דומיין**: לרשום את דומיין המותג ולהגדיר MYSTERY_MAIL_DOMAIN אליו (או לתת-דומיין, למשל
   mail.<דומיין>). הפניות חייבות לצאת מכתובת של בדק עסק.
2. **Resend**: Domains -> Add domain (שליחה: SPF/DKIM) ו-Receiving -> אותו דומיין (רשומת MX לפי
   הדשבורד). Webhooks -> Add: כתובת `https://<האתר>/api/mystery/inbound`, אירוע `email.received`,
   ולהעתיק את הסוד (whsec_...) ל-RESEND_WEBHOOK_SECRET.
3. **התקתוק השעתי** (Supabase, SQL Editor; דורש את ההרחבות pg_cron ו-pg_net מופעלות):

```sql
select cron.schedule(
  'bedek-mystery-tick',
  '7 * * * *',
  $$
  select net.http_post(
    url := 'https://<האתר>/api/mystery/tick',
    headers := jsonb_build_object('x-tick-secret', '<MYSTERY_TICK_SECRET>', 'content-type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
```

   הסוד יושב בהגדרת ה-cron בלבד (בתוך המסד, לא בריפו). לביטול: `select cron.unschedule('bedek-mystery-tick');`
4. **הערוצים המסייעים**: מספר וואטסאפ/טלפון של החברה, ומי מהמייסדים מטפל בתור ב-/admin/mystery.

## מה נשאר פתוח

- Places: להוסיף `regularOpeningHours` ל-field mask של Details כדי שהתזמון יעבוד לפי שעות הפתיחה
  האמיתיות (היום נופל לברירת המחדל א-ה 10-16 כי השדה לא נשלף).
- וואטסאפ אוטומטי - רק כשיש היקף שמצדיק תלות ב-API של מטא. טלפון אוטומטי - לא בתוכנית.
- מסך "מה קורה לפנייה שלך" (#31) ירכיב את הכרטיס הזה עם אותות הסריקה והראיון לסיפור אחד.
