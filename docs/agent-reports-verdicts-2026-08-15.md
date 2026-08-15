# פסיקות על דוחות סוכן השותף - 2026-08-15

רשומת תוצאת הסינון עבור השותף: מה נבדק אמפירית, מה אושר, ומה תוקן בפועל.
כל שישה הדוחות שנבדקו בסבב הזה שוחזרו בהרצה חיה לפני התיקון (red), ואומתו אחרי (green).

| שם הדוח | פסיקה | מה תוקן |
|---|---|---|
| `bugs/forbidden-host-rejects-fc-fd-domains.md` | מאושר | בדיקות ה-IPv6 (fc/fd/fe80/::1) הוגבלו לליטרל IPv6 אמיתי בלבד, כך ש-fcbarcelona.com ו-fdny.org עוברים בעוד `[fd00::1]` ו-`[fc00::1]` עדיין נחסמים |
| `bugs/narrative-number-guard-too-permissive.md` | מאושר | מאגר המספרים המותרים נבנה מרשימה מפורשת של ערכים מוצגים (ציונים, דירוג, ביקורות, PSI, LCP ב-ms ובשניות, 100, טקסטי הפערים) במקום מ-`JSON.stringify(findings)`, ופיצול המספר לחלקיו בוטל - ספרות בתוך כתובות שנסרקו כבר לא מכשירות מספר מומצא, ו-"4.2" כבר לא מתיר "4" |
| `bugs/pages-crawled-double-counts-redirects.md` | מאושר | דדופ על הכתובת הסופית אחרי redirect: שלושה נתיבים שמפנים לעמוד הבית נספרים כעמוד אחד, ו-`crawledUrls` יוצא ייחודי (הזכייה השקרית בחוק multi_page נסגרה) |
| `bugs/pagespeed-api-key-in-query-string.md` | מאושר חלקית | הדוח צדק על הסתירה מול `docs/llm.md`, אבל ההערה בקוד ("זו הדרך היחידה ש-PSI תומך בה") נבדקה חי: קריאה אחת ל-PSI עם המפתח רק בכותרת `x-goog-api-key` החזירה 200 עם עץ Lighthouse מלא. המפתח הועבר לכותרת, ההערה השגויה נמחקה, והמדיניות ב-`docs/llm.md` עודכנה לציין שהיא חלה על כל לקוחות Google |
| `bugs/review-text-escapes-prompt-fence.md` | מאושר | טקסט ביקורת עובר `stripFenceMarkers` לפני הכניסה לבלוק `<<<REVIEWS>>>`; אותו טיפול הוחל גם על שם העסק בפרומפט הנרטיב. הפונקציה רוכזה ב-`llm/client.ts` ומשמשת גם את `interview/extract.ts`, כך שההערה שם ("אותו משטר כמו analyze/reviews") הפכה לנכונה |
| `bugs/ssrf-redirect-bypasses-host-allowlist.md` | מאושר - תוקן | בדיקת המארח הוצאה ל-`src/pipeline/forbidden-host.ts` (מודול טהור שגם הפייפליין מייבא) ורצה עכשיו בשכבת ה-fetch: `fetchPage` עבר ל-`redirect: "manual"`, עוקב אחרי Location בעצמו (כולל יחסי), בודק מארח לפני כל בקשה ובכל קפיצה, חוסם סכמות שאינן http/https ומגביל ל-5 קפיצות. זה מכסה גם את המסלולים שלא עברו בבדיקת ה-API בכלל: אתר שהגיע מ-Places ומסלול ה-url הישיר. PSI מדלג על מארח חסום (חיסכון, לא SSRF). הקשחת DNS נשארה מחוץ לתחום כחסם-deploy מתועד |
| `bugs/scan-save-and-status-transition-not-atomic.md` | מאושר | `saveScanResult` עבר לטרנזקציה אינטראקטיבית שכוללת גם את המעבר ל-report_ready (updateMany מותנה ב-status: scanned, count 0 זורק ומגלגל אחורה). קריסה בין השמירה למעבר כבר לא משאירה אבחון תקוע ב-scanned עם סריקה שמורה |

## הערות

- דוחות נוספים בתיקייה (`features/*`, `reviews/*`) לא נכללו בסבב הזה ואין עליהם פסיקה כאן.
- `features/shared-prompt-fencing-utility.md` נסגר דה-פקטו כתוצר לוואי של תיקון גדר הפרומפטים: יש עכשיו פונקציה משותפת אחת.
- אימות סבב ראשון: `npx vitest run` - 538 בדיקות עוברות, `npx tsc --noEmit` נקי.
- אימות אחרי תיקון ה-SSRF: `npx vitest run` - 569 בדיקות עוברות, `npx tsc --noEmit` נקי.
