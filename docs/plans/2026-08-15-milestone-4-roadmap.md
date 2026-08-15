# תוכנית אבן דרך 4: Roadmap מסחרי + Project Brief

> **לסוכנים מבצעים:** לבצע עם superpowers:subagent-driven-development, משימה-משימה לפי הסדר. **תהליך רזה (הנחיית מייסד, 15.8):** סבב סקירה אחד לכל היותר למשימה (ספק+איכות מאוחד), שאר האימות נדחס לשער. אין בדיקות דפדפן במהלך הפיתוח - שלב QA דפדפן ייעודי יגיע אחרי שילוב העיצוב.

**מטרה:** לסגור את המשפך המסחרי - מדוח אבחון ל-Roadmap מדורג של הזדמנויות מהקטלוג (עם מחירים חקורים, אפס מספרים מומצאים) ועד Project Brief שנשלח אלינו במייל.

**ארכיטקטורה:** מנועים טהורים (התאמה, דירוג) על גבי ScoreReport + BusinessModel קיימים; אורקסטרטור + repo בדפוס הראיון (טרנזקציה אטומית, resume-safe); שכבת API בדפוס InterviewError המתויג; מסך 5 אחרון ורק אחרי בחירת העיצוב. ה-LLM מנמק ובוחר ניסוח - לעולם לא ממציא מספר: כל מספר מגיע ב-string interpolation מהקטלוג/בנצ'מרקים בלבד.

**סטאק:** הקיים. אפס טבלאות חדשות - Roadmap/RoadmapItem/Brief/OpportunityCatalog/Benchmark כבר בסכמה ומאוכלסות (10 פריטים, 18 בנצ'מרקים). מכונת המצבים כבר יודעת roadmap_ready.

---

## עובדות תשתית (למבצעים - לא לנחש, זה קיים)

- `opportunity_catalog.conditions` הוא `{"gapKeys": string[]}` - המפתחות הם **מפתחות חוקים של מנוע הציונים** (engine.ts/dimensions.ts): `gbp_exists, analytics, fb_pixel, whatsapp, contact_form, online_booking, perf, lcp, email_link, chat_widget, has_reviews, review_volume, no_problem_themes, lead_handling, manual_tasks, internal_tools`.
- `ScoreReport` (src/pipeline/score/types.ts): dimensions[].rules[] עם `{key, points, known, earned, text}`; פער = `known && !earned`; משקל ממד 0-1.
- ממד process (dimensions.ts:190-210) הוא **stub מכוון**: `known: () => false` תמיד. אבן 4 מחליפה אותו (משימה 1).
- `BusinessModel` (business-model.ts): data לפי 10 סקציות, credits (0/0.5/1), fieldSources, completenessPct. אחרי ראיון אמיתי (אופטיקה בק d04eaa39) יש lead_flow.whoHandles/responseTime, manual_tasks.manualTasks, tools, pains עם ציטוטים.
- סטטוסים (status.ts): `report_ready -> roadmap_ready`, `interviewing -> roadmap_ready`, `roadmap_ready -> interviewing` (חזרה לראיון = Roadmap מחושב מחדש). transitionDiagnosis עם CAS קיים.
- שגיאות API: דפוס `InterviewError` המתויג (contract.ts, kind: not_found/conflict/invalid) - להרחיב אותו, לא להמציא חדש. normalizeTypography (extract.ts) חובה על כל פלט LLM חדש.
- אין ספק מייל ב-env עדיין - שכבת השליחה חייבת להיות מוזרקת (ראו משימה 7). מייל היעד: lahavk@raion.co.il (קבוע בקונפיג, לא בקוד).

## מבנה קבצים

- Create: `src/pipeline/roadmap/matching.ts`, `src/pipeline/roadmap/opportunity-score.ts`, `src/pipeline/roadmap/reasoning.ts`, `src/pipeline/roadmap/brief.ts`, `src/server/roadmap-repo.ts`, `src/server/run-roadmap.ts`, `src/server/api/roadmap-handlers.ts`, `src/app/api/roadmap/[id]/route.ts`, `src/app/api/brief/[itemId]/route.ts`
- Modify: `src/pipeline/score/dimensions.ts` (ממד process אמיתי), `src/pipeline/score/engine.ts` (חתימה עם מודל אופציונלי), `src/server/interview-repo.ts` או `run-interview.ts` (רענון ציונים בסיום ראיון - ראו משימה 1), `src/pipeline/interview/contract.ts` (RoadmapError אם צריך kind חדש - כנראה לא)
- מסך 5 (משימה 8): `src/app/roadmap/[id]/page.tsx` + hook `use-roadmap` + רכיב בעיצוב שייבחר - **רק אחרי בחירת העיצוב של להב**.

---

### משימה 0: נוכחות חברתית כ"אתר" - זיהוי, זהות, וניקוד כן

**הרקע (ממצא מייסד, 15.8):** עסקים רבים שמים בגוגל את עמוד הפייסבוק/אינסטגרם שלהם בשדה האתר. היום זה מייצר שלוש בעיות: (1) הקרולר קורא shell של פייסבוק (חומת התחברות) ומסיק "אין כלום" כאילו זו עובדה על העסק; (2) PSI על דומיינים כאלה נחסם (429); (3) **באג זהות אמיתי:** websiteKeyOf זורק path, אז שני עסקים עם עמודי פייסבוק שונים מקבלים אותו מפתח (facebook.com) והשני מתמזג לעסק הראשון.

**Files:** Create: `src/pipeline/social-hosts.ts`; Modify: `src/server/website-key.ts`, `src/pipeline/run-diagnosis.ts` (דילוג על crawl+PSI), `src/pipeline/score/dimensions.ts` (חוק "אתר עצמאי"), `src/pipeline/model/business-model.ts` (ערוץ חברתי); Test: `tests/social-hosts.test.ts`, `tests/website-key.test.ts`, `tests/run-diagnosis.test.ts`, `tests/dimensions.test.ts`

- [ ] `social-hosts.ts`: `export function socialPresenceOf(url: string): { platform: string } | null` - זיהוי לפי host מנורמל: facebook.com/m.facebook.com, instagram.com, tiktok.com, wa.me/api.whatsapp.com, linktr.ee, linkedin.com, x.com/twitter.com, youtube.com. דטרמיניסטי, רשימה גלויה.
- [ ] `websiteKeyOf`: לדומיין חברתי המפתח כולל את מקטע ה-path הראשון (`facebook.com/mybusiness`); דומיין חברתי חשוף בלי path נשאר כהיום. כל שאר הדומיינים - התנהגות זהה להיום (בדיקות הרגרסיה הקיימות נשארות ירוקות כלשונן).
- [ ] pipeline: אתר חברתי => לא מריצים crawl ולא PSI (אין עלות, אין 429, אין אותות זבל); findings מקבל `socialOnly: { platform, url }` + הערת איסוף "הנוכחות הדיגיטלית היא עמוד <פלטפורמה> - אין אתר עצמאי לסריקה".
- [ ] ניקוד: חוקי אתר נשארים "לא נבדק" (known=false); בממד הנראות חוק חדש/מותאם "אתר עצמאי" - עבור socialOnly: known=true, earned=false, gapText ברור לבעל העסק. הנרטיב מקבל את זה כפער מוביל מועמד.
- [ ] מודל: channels מקבל את העמוד החברתי (source: scan) - זה ערוץ אמיתי של העסק.
- [ ] בדיקות: זיהוי כל פלטפורמה; מפתח עם path לשני עסקי פייסבוק שונים = מפתחות שונים; pipeline מדלג על crawl/PSI ב-socialOnly; חוק "אתר עצמאי" earned לאתר רגיל, פער ל-socialOnly, לא ידוע כשאין אתר כלל.
- [ ] Commit: `feat(4-0): social page as website - honest detection, per-page identity, no garbage crawl`

### משימה 0.5: בחירת סניף - קומבו-בוקס עם הקלדה, וכתובת שמפעילה גם חיפוש מפות

**הרקע (דרישת מייסד, 15.8):** (א) הקלדת כתובת אתר (gentleman.co.il) עוקפת היום את גוגל מפות בשקט ומייצרת דוח no_gbp לעסק שכן קיים במפות - משתמש אמיתי מקליד מה שיש לו ביד. (ב) לרשת עם כמה סניפים להב רוצה רשימת תוצאות עם שדה הקלדה והשלמה כדי למצוא את הסניף הרלוונטי ולקבל עליו דוח.

**Files:** Modify: `src/app/use-business-search.ts` (כל הלוגיקה - מנדט logic-in-hook), `src/app/search-box.tsx` (תצוגה דקה), `src/server/api/search-handler.ts` אם נדרש; Create: `src/app/candidate-filter.ts` (סינון טהור, נבדק); Test: `tests/candidate-filter.test.ts`, הרחבת `tests/search-handler.test.ts`

- [ ] **כתובת אתר מפעילה גם מפות:** כשמזוהה URL בשדה, לפני ניווט לסריקה - קריאה אחת ל-/api/search עם הדומיין כשאילתה. יש תוצאות: מציגים את הרשימה עם כותרת "מצאנו את העסק גם בגוגל מפות" + אופציה מפורשת "סריקת האתר בלבד" (המסלול הקיים). אין תוצאות: ממשיכים ישר לסריקת אתר כהיום. עלות: קריאת Places אחת להקלדת URL - זהה לחיפוש שם רגיל.
- [ ] **קומבו-בוקס סניפים:** כשחוזרות כמה תוצאות - שדה טקסט מעל הרשימה שמסנן אותה חי (התאמת תת-מחרוזת על שם + כתובת, פונקציה טהורה ב-candidate-filter.ts); Enter על סינון שלא הותיר תוצאות או כפתור "חפשו שוב עם הטקסט הזה" מריץ חיפוש Places מחודש עם הטקסט המורחב (למשל "ג'נטלמן דיזנגוף"). בחירת סניף = אבחון מלא על ה-placeId שלו, כהיום.
- [ ] נגישות: דפוס combobox (role, aria-expanded, aria-activedescendant, ניווט חצים בין תוצאות, Escape סוגר); הרשימה כבר aria-live.
- [ ] בדיקות: הסינון הטהור (שם, כתובת, ריק, אין התאמות); הזרימה URL->search (הוק - החלקים הטהורים; ה-JSX בשער); search-handler לא נשבר.
- [ ] Commit: `feat(4-0.5): branch picker combobox and URL input that also searches Maps`

### משימה 0.7: העשרת נתונים - עמודות עסק מלאות + raw payload לכל סריקה

**הרקע (דרישת מייסד, 15.8):** בטבלת businesses יש placeId אבל city ריק וטלפון לא קיים בכלל - הסריקה אוספת ולא כותבת חזרה. בנוסף להב רוצה payload: לשמור את הנתונים הגולמיים שאנחנו כבר מקבלים (ומשלמים עליהם) לשימושים עתידיים.

**Files:** Modify: `prisma/schema.prisma` (Business.phone/address; Scan.raw Json?), `src/pipeline/google/places.ts` (formattedAddress ב-field mask של details + החזרת raw), `src/pipeline/google/pagespeed.ts` (החזרת raw מקוצץ), `src/pipeline/scan.ts` + `src/pipeline/scan-website.ts` (איסוף raw), `src/server/diagnosis-repo.ts` (persist: scan.raw + עדכון Business), `src/pipeline/types.ts`; Create: `src/pipeline/city-of.ts` (גזירת עיר טהורה); Test: `tests/city-of.test.ts` + הרחבות קיימות

- [ ] מיגרציה אדיטיבית: `businesses.phone TEXT NULL`, `businesses.address TEXT NULL`, `scans.raw JSONB NULL`. בלי שינוי לשורות קיימות (DB נתוני בדיקה, יימחק בעתיד ממילא).
- [ ] details field mask מקבל formattedAddress (אותה רמת חיוב - Contact SKU כבר פעיל בגלל הטלפון); findings.business מקבל address.
- [ ] `cityOf(address: string): string | null` - טהורה: המקטע הלפני-אחרון בפיצול פסיקים של כתובת ישראלית ("רגר 12, באר שבע, ישראל" -> "באר שבע"), עם הגנות (פחות מ-2 מקטעים -> null, סינון "ישראל"/מיקוד).
- [ ] persist אחרי סריקה: עדכון Business עם phone/address מה-findings ו-city מ-cityOf רק כשהעמודה ריקה או השתנתה; לא דורס city שהוקלד ידנית כשאין כתובת.
- [ ] scan.raw: `{ placeDetails?: <גוף Places המלא>, pageSpeed?: <מקוצץ: categories+metrics+loadingExperience, בלי מיליון audits>, crawledUrls?: string[] }` - בלי HTML גולמי (כבד, חסר ערך עתידי). האיסוף מחזיר {data, raw} בלי לשבור חוזים קיימים.
- [ ] בדיקות: cityOf (5+ צורות כתובת), persist מעדכן עסק, raw נשמר בשני המסלולים, מסלול socialOnly לא נשבר (אין details? יש - Places רץ במסלול placeId).
- [ ] Commit: `feat(4-0.7): business contact columns + raw scan payload for future use`

### משימה 1: ממד בשלות תהליכים אמיתי + רענון ציונים אחרי ראיון

**Files:** Modify: `src/pipeline/score/dimensions.ts`, `src/pipeline/score/engine.ts`, `src/server/run-interview.ts`; Test: `tests/score-engine.test.ts`, `tests/dimensions.test.ts`, `tests/run-interview.test.ts`

- [ ] חתימת המנוע: `computeScores(findings, model?: BusinessModel | null)` - פרמטר שני אופציונלי; חוקי process מקבלים את המודל דרך closure/העברה (לשמור על RuleDef הקיים: להוסיף `modelKnown?/modelEarned?` או לבנות את חוקי process כפונקציה `processRules(model)` - למממש לבחור את המינימלי, לא לשבור אף חוק קיים).
- [ ] שלושת החוקים מהמודל (credit של הסקציה >= 1 => known):
  - `lead_handling` (40): earned כאשר lead_flow מעיד על טיפול מסודר - יש whoHandles וגם responseTime שאינו מכיל סימני נפילה (leadDrop ריק/לא קיים). gapText מצטט את מה שסופר ("פניות נופלות: <leadDrop>").
  - `manual_tasks` (30): earned כאשר credit>=1 וגם אין manualTasks מדווחות; יש רשימת משימות ידניות => פער עם הציטוט.
  - `internal_tools` (30): earned כאשר credit>=1 של tools וגם דווח כלי ניהול כלשהו מעבר לחשבוניות (CRM/יומן מנוהל); "אין CRM, אקסל" => פער.
- [ ] רענון: `finishInterview` מחשב מחדש את scores מה-findings של הסריקה האחרונה + המודל המעודכן ושומר על שורת ה-scan (עדכון עמודת scores) באותה טרנזקציה של מעבר הסטטוס, כך שהדוח אחרי ראיון מציג בשלות תהליכים חיה. אין ראיון = אין שינוי (model=null => process נשאר "אין מידע", בדיוק כהיום).
- [ ] בדיקות: process עם מודל מזוכה earned/gap לכל חוק; בלי מודל - זהה להתנהגות היום (רגרסיה אפס); finishInterview מעדכן scores (fake-db); ראיון של אופטיקה בק (fixture מהמודל האמיתי) מדליק את הממד.
- [ ] Commit: `feat(4-1): process maturity dimension scored from the interview model`

### משימה 2: מנוע התאמה טהור - matching.ts

**Files:** Create: `src/pipeline/roadmap/matching.ts`; Test: `tests/roadmap-matching.test.ts`

- [ ] טיפוסים:
```ts
export interface CatalogRowLite {
  id: string; name: string; problem: string; solution: string;
  conditions: { gapKeys: string[] }; costRange: string; savingRange: string;
  complexity: string; installTime: string;
}
export interface MatchEvidence { ruleKey: string; dimension: DimensionKey; text: string; lostWeightedPoints: number; }
export interface OpportunityMatch {
  catalog: CatalogRowLite;
  evidence: MatchEvidence[];          // רק פערים שידועים (known && !earned)
  unknownKeys: string[];              // gapKeys שאין עליהם מידע (known=false) - מזינים confidence
  painQuotes: string[];               // ציטוטי pains מהמודל שנקשרו לפריט (חיפוש מילות מפתח בשדות pains)
}
export function matchOpportunities(report: ScoreReport, model: BusinessModel | null, catalog: CatalogRowLite[]): OpportunityMatch[];
```
- [ ] כללים: פריט נכנס אם יש לפחות ראיה אחת (evidence לא ריק) **או** painQuote רלוונטי; lostWeightedPoints = points * weight של הממד; אין המצאות - painQuotes נלקחים אך ורק מ-model.data.pains (ערכי string), התאמה במילות מפתח פשוטות לפי הפריט (מיפוי סטטי בקובץ: לדוגמה "תור" ל-online_booking, "טלפון/עומס" לבוט וואטסאפ, "לא חוזרים/שימור" לאיסוף ביקורות וכד' - המיפוי גלוי וקבוע, לא LLM).
- [ ] דטרמיניזם מלא: אותו קלט = אותו פלט, סדר יציב (לפי סכום lostWeightedPoints יורד ואז שם).
- [ ] בדיקות: התאמה על ScoreReport סינתטי של קמפאי (פערי analytics/fb_pixel/online_booking) - נבחרים הפריטים הנכונים; פריט בלי אף ראיה לא נכנס; pains בלבד מכניס פריט עם evidence ריק; יציבות סדר.
- [x] Commit: `feat(4-2): pure opportunity matching - gap evidence + owner pain quotes`

**As-built (15.8):** המימוש נחת בתוך 53df428 (מרוץ אינדקס-גיט עם קומיט מסך הבית - התוכן נכון, ההודעה משותפת; מאז: סוכנים לא מריצים גיט, הבקר מבצע קומיטים). סבב הסקירה היחיד תפס ותיקן: נרמול אותיות סופיות (תיאומים/תיאום), גבולות מילים בעברית עם קידומות דבוקות (רגקס, לא includes - "בתור בעל עסק" כבר לא נקשר לתורים), ניתוב מפתחות למה שהקטלוג באמת מכריז (ידני/אקסל -> lead_handling; מוניטין שלילי -> no_problem_themes), דדופ ציטוטים, והגנה על מודל ישן בלי סקציית pains (toModelView לא ממלא data). 14 בדיקות. פערים ללא מיפוי כאב מכוון (gbp_exists/perf/analytics ועוד - נכנסים דרך ראיות ממילא). הערה למשימות 3+5: התאמה יכולה להיכנס על כאב בלבד עם אפס ראיות - הניסוח בנימוק אסור שיישמע "חסר לך X" על משהו שקיים.

### משימה 3: Opportunity Score + שלביות - opportunity-score.ts

**Files:** Create: `src/pipeline/roadmap/opportunity-score.ts`; Test: `tests/opportunity-score.test.ts`

- [ ] **החלטת מייסד (15.8): הכאב של הבעלים מוביל את הדירוג** - "הכי קל למכור מה שהוא כבר רוצה". תוספת ה-painQuote היא הרכיב הדומיננטי בנוסחה.
- [ ] נוסחה דטרמיניסטית (0-100, שקופה - תתועד בקוד):
```ts
// בסיס: אחוז הנקודות המשוקללות האבודות שהפריט סוגר, מנורמל מול הפריט המקסימלי ברשימה (0-60)
// כאב בעלים: +20 אם יש painQuote (הבעל אמר שזה כואב - זה שווה יותר מכל היוריסטיקה)
// ודאות: -0 (evidence מלא) / -10 (יש unknownKeys) - חוסר מידע מוריד דירוג, לא ממציא
// מורכבות: low +10, medium +0, high -10 - מהיר-לנצח מדורג גבוה (עקרון Quick Wins מהאפיון)
export function scoreOpportunity(match: OpportunityMatch, maxLostPoints: number): { score: number; confidence: "high" | "medium" | "low" };
export function phaseOf(match: OpportunityMatch): "quick_wins" | "automation" | "ai" | "transformation";
```
- [ ] confidence: high = כל ה-gapKeys ידועים והסקציות הרלוונטיות במודל עם credit>=1 היכן שנדרש; medium = יש ראיות אבל גם unknownKeys; low = pains בלבד. תג "דיוק ישתפר עם עוד מידע" במסך נגזר מ-confidence != high (האפיון, מסך 5).
- [ ] phaseOf לפי הקטלוג הקיים: complexity low + עלות חד-פעמית = quick_wins; חיבורי CRM/מדידה/תורים = automation; פריטי סוכן/בוט AI = ai; transformation שמור לעתיד (לא בקטלוג הנוכחי). מיפוי לפי שם קטגוריה בקובץ - גלוי וניתן לבדיקה.
- [ ] בדיקות: מונוטוניות (יותר נקודות אבודות = ציון גבוה יותר), painQuote מרים, unknown מוריד, גבולות 0-100, כל פריטי הקטלוג האמיתיים מקבלים phase.
- [x] Commit: `feat(4-3): deterministic opportunity score and phasing - zero invented numbers`

**As-built (15.8):** מפתח הזיהוי לשלב הוא catalog.name (אין id סטטי ואין שדה category ב-seed - זה אותו מפתח שה-seed עצמו משתמש בו ל-upsert). המיפוי: ai = סוכן לידים + בוט וואטסאפ; quick_wins = פרופיל GBP + חיבור וואטסאפ לאתר; automation = השאר (תורים, ביקורות x2, מהירות, מדידה, CRM); transformation ריק במכוון (בדיקה מפורשת). ברירת מחדל automation לפריט עתידי לא ממופה (הפונקציה טוטאלית, לא זורקת). confidence: low בכל evidence ריק, בלי תלות ב-unknownKeys. 12 בדיקות.

### משימה 4: roadmap-repo - שמירה אטומית וקריאה

**Files:** Create: `src/server/roadmap-repo.ts`; Modify: `tests/fakes/fake-db.ts` (roadmap/roadmapItem/brief); Test: `tests/roadmap-repo.test.ts`

- [ ] `createRoadmap(prisma, diagnosisId, items: {catalogId, score, confidence, phase}[])` - טרנזקציה: יצירת roadmap + כל הפריטים; מחזיר את ה-id. Roadmap חדש לכל חישוב (היסטוריה נשמרת - "מחושב מחדש" מהאפיון), הקריאה תמיד לוקחת את האחרון.
- [ ] `getRoadmapView(prisma, diagnosisId)` - האחרון לפי createdAt, עם join לקטלוג + בנצ'מרקים; מחזיר RoadmapView מוכן למסך (שמות, טווחים כמחרוזות מהקטלוג, phase, score, confidence, benchmarks עם source+verifiedAt); null אם אין.
- [ ] בדיקות: אטומיות (כשל באמצע = כלום לא נשמר), קריאת האחרון מבין שניים, join מלא.
- [x] Commit: `feat(4-4): roadmap repo - atomic create, latest-view read`

**As-built (15.8):** RoadmapView/RoadmapItemView/RoadmapBenchmarkView מיוצאים מ-roadmap-repo; Confidence/Phase מיובאים מ-opportunity-score (טיפוס צר, לא string). סדר פריטים בקריאה: score desc ואז id asc (אין עמודת rank בסכמה - מפורש ודטרמיניסטי, קיבוץ לפי phase בצד המסך). בנצ'מרקים: Benchmark.catalogId בלבד - כל הבנצ'מרקים של פריט הקטלוג, אין מפתח עדין יותר. fake-db קיבל roadmap/roadmapItem/brief + מאגרי catalogs/benchmarks עם FK אמיתי (catalogId לא קיים = זריקה, כמו Postgres) בתוך מנגנון ה-rollback. פער שהתגלה: אין עמודת reasoning ב-RoadmapItem - משימה 5 מוסיפה במיגרציה אדיטיבית. 7 בדיקות.

### משימה 5: אורקסטרטור + נימוק LLM - run-roadmap.ts + reasoning.ts

**Files:** Create: `src/server/run-roadmap.ts`, `src/pipeline/roadmap/reasoning.ts`; Test: `tests/run-roadmap.test.ts`, `tests/roadmap-reasoning.test.ts`

- [ ] `buildRoadmap(prisma, diagnosisId, opts?: {complete?})`: טוען סריקה אחרונה + מודל (getInterviewState או ישירות); מחשב scores טריים (משימה 1) => matchOpportunities => scoreOpportunity => createRoadmap => transitionDiagnosis ל-roadmap_ready (מ-report_ready או interviewing; CAS כמו בראיון). InterviewError בכל מסלולי הכשל (not_found וכו').
- [ ] reasoning.ts: משפט נימוק אחד לכל פריט - prompt עם delimiters בדפוס extract.ts, קלט: problem/solution מהקטלוג + evidence texts + painQuote; פלט: משפט עברית שמסביר למה זה רלוונטי לעסק הזה. **חוזה קשיח: הנימוק לא מכיל ספרות בכלל** - sanitizer מוחק כל תו ספרה ומפיל fallback לתבנית דטרמיניסטית (problem מהקטלוג + הראיה הראשונה). normalizeTypography על הכול. usage נצבר כמו בראיון.
- [ ] אין ראיון = עובד (model null, פריטי confidence low-medium בלבד) - "יש Roadmap גם בלי ראיון" (אפיון).
- [ ] בדיקות: מסלול מלא על fake-db עם קטלוג אמיתי (fixture מה-10), מעבר סטטוס, נימוק עם ספרות נופל ל-fallback, אידמפוטנטיות קריאה חוזרת (roadmap שני נוצר, הקריאה מחזירה אחרון).
- [x] Commit: `feat(4-5): roadmap orchestrator - fresh scores, catalog matching, guarded LLM reasoning`

**As-built (15.8):** עמודת reasoning נוספה ל-RoadmapItem (מיגרציה 20260815124719, אדיטיבית) - פער תוכנית שנסגר. שומר הספרות עובד עם \p{Nd} (כל ספרה בכל כתב, לא רק ASCII). ממצא חשוב: תבנית ה-fallback אסור שתכלול את catalog.solution - כמה פתרונות בקטלוג מכילים ספרות ("24/7", "GA4", "LCP מתחת ל-4 שניות"); התבנית היא problem + ראיה ראשונה נקיית-ספרות, או ציטוט כאב, או problem לבד (רשת ביטחון סופית). פריט שנכנס על כאב בלבד מקבל נימוק מעוגן-ציטוט ("בעל העסק סיפר: ...") ולא "חסר לך". buildRoadmap עם טוען ייעודי (לא getInterviewState - מבחין not_found/אין-סריקה ומחזיר מודל null אמיתי), ציונים טריים בזיכרון בלבד (לא נכתב ל-scan.scores - זה של finishInterview), חישוב מחדש מ-roadmap_ready נשאר roadmap_ready בלי מעבר. כשל LLM לא מפיל רודמאפ - הכול נופל לתבנית. 15+8 בדיקות חדשות.

### משימה 6: מסלולי API + סקירת סבב יחיד למשימות 2-6

**Files:** Create: `src/server/api/roadmap-handlers.ts`, `src/app/api/roadmap/[id]/route.ts`; Test: `tests/roadmap-handlers.test.ts`

- [ ] POST `/api/roadmap/[id]` = buildRoadmap (יצירה/חישוב מחדש), GET = getRoadmapView. דפוס interview-handlers בדיוק: factories מוזרקות, InterviewError => סטטוס לפי kind, כל השאר 500 גנרי, אפס דליפה. תקרת ולידציה: אין body ב-POST (מתעלמים מגוף).
- [ ] בדיקות handlers במוקים + ולידציות.
- [ ] **סקירה מאוחדת אחת** (ספק+איכות) על משימות 2-6 יחד - זה הסבב היחיד; ממצאים מתוקנים ואין סקירה חוזרת אלא אם נמצא Critical.
- [ ] Commit: `feat(4-6): roadmap API routes with tagged-error mapping`

### משימה 7: Project Brief - מחולל + שליחה

**Files:** Create: `src/pipeline/roadmap/brief.ts`, `src/app/api/brief/[itemId]/route.ts` (+handlers באותו קובץ roadmap-handlers); Test: `tests/roadmap-brief.test.ts`

- [ ] `buildBrief(item: RoadmapItemView, model, business): string` - תבנית קבועה בעברית לפי סעיף 8 באפיון: פרטי עסק ותקציר מודל רלוונטי / הבעיה עם הראיות / הפתרון והיקפו / מערכות קיימות (מ-model.tools) / טווח מחיר וזמן מהקטלוג (interpolation בלבד) / שאלות פתוחות (סטטיות לפי phase - לא LLM ב-MVP). דטרמיניסטי לחלוטין, בלי LLM, בלי תווים אסורים.
- [ ] שליחה: `export interface BriefTransport { send(to: string, subject: string, body: string): Promise<void> }` - ברירת מחדל dev: כתיבה ללוג השרת + שמירת Brief עם sentAt=null; כשיהיה ספק מייל (Resend - פריט רק-להב: פתיחת חשבון ומפתח ב-env) מחליפים מימוש בלי לגעת בשאר. POST `/api/brief/[itemId]` יוצר Brief, מנסה לשלוח ל-BRIEF_EMAIL מ-env (ברירת מחדל lahavk@raion.co.il), מעדכן sentAt בהצלחה, ומחזיר {ok, sent}.
- [ ] status של RoadmapItem עובר ל-"requested" כשנוצר Brief (זה ה"אני רוצה להטמיע את זה").
- [ ] בדיקות: תבנית מלאה מנתוני אופטיקה בק fixture, אפס ספרות שלא מהקטלוג, transport מוזרק נקרא, sentAt מתעדכן רק בהצלחה.
- [ ] Commit: `feat(4-7): project brief - deterministic template, pluggable email transport`

### משימה 8: מסך 5 - Business Map + Roadmap (בעיצוב הזמני)

**עדכון החלטת מייסד (15.8 ערב): נקודת העצירה לעיצוב בוטלה.** להב: "להמשיך בעיצוב הזמני עד הסוף... המסכים הנוכחיים נטו לבדיקות שלנו". המסך נבנה בעיצוב הזמני באותו דפוס (לוגיקה ב-hook, תצוגה דקה). עיצוב אמיתי + פלואו לפי סוגי משתמשים = שלב ב (יחד עם משתמשים, הרשאות, ניווט שלבים בראיון במקום דלג - ראו זיכרון product-phase2-users). גלריית העיצובים נשארת נכס לשלב ההוא.

**Files:** Create: `src/app/roadmap/[id]/page.tsx` (RSC), `src/app/roadmap/use-roadmap.ts` (hook), רכיב תצוגה בהתאם לעיצוב; Modify: registry אם עדיין בדפוס variants; קישור מהדוח ("דלג ל-Roadmap" הופך פעיל).

- [ ] Business Map: שישה שלבי שרשרת ערך עם סטטוס תקין/חלש/חסר/אין מידע (נגזר מציוני הממדים + credits), הזדמנויות לפי שלבים (quick_wins/automation/ai) עם כרטיס לכל פריט: שם, בעיה, נימוק, score, טווחי עלות/חיסכון כלשונם מהקטלוג, תג ביטחון, כפתור "אני רוצה להטמיע את זה" => POST brief => אישור.
- [ ] מד שלמות + קישור "שפר את הדיוק" חזרה לראיון (roadmap_ready -> interviewing מותר).
- [ ] Commit: `feat(4-8): roadmap screen - business map, phased opportunities, brief request`

### משימה 9: שער יציאה אבן 4

- [ ] Roadmap חי על אופטיקה בק (מודל 90% אחרי הראיון): פריטים נכונים לפערים (תורים אונליין, פיקסל, סוכן לידים...), ציטוט הכאב של שימור לקוחות מופיע כראיה, כל המספרים זהים לקטלוג (בדיקת diff מול טבלת opportunity_catalog - אפס מספרים שלא משם).
- [ ] Roadmap בלי ראיון (קמפאי אחרי סריקה חוזרת): confidence נמוך יותר, תגי דיוק, עדיין שימושי.
- [ ] חזרה לראיון מ-roadmap_ready ו-Roadmap מחודש אחרי (סעיף המצבים באפיון).
- [ ] Brief נוצר, נשמר, ותוכנו עובר בדיקת תווים אסורים + אפס מספרים מומצאים.
- [ ] נרטיב מול ציונים מרועננים (ממצא סקירת משימה 1): אחרי ראיון, topGaps יכולים להשתנות (lead_handling הוא החוק הכבד במערכת - 8.0 נקודות impact) בעוד הנרטיב השמור טוען את השלושה הישנים - לוודא בשער שהדוח לא סותר את עצמו, ואם כן לרענן נרטיב בסיום ראיון או לסמן לשלב ב.
- [ ] `npm test` + typecheck + build; docs/milestone-4-gate.md בתבנית הקיימת + סעיף "מוכנות לפריסה" (רשימת החוסמים המרוכזת).
- [ ] Commit: `docs(4-9): milestone 4 exit gate`

## סדר ותלויות

| # | משימה | תלות |
|---|---|---|
| 0 | נוכחות חברתית כאתר | - |
| 1 | ממד process + רענון ציונים | - |
| 2 | מנוע התאמה | 1 (מפתחות process) |
| 3 | דירוג ושלביות | 2 |
| 4 | repo | - |
| 5 | אורקסטרטור + נימוק | 1-4 |
| 6 | API + סקירה מאוחדת 2-6 | 5 |
| 7 | Brief | 4-6 |
| 8 | מסך 5 | 6 + **בחירת עיצוב (להב)** |
| 9 | שער | הכול |

---

## הערות as-built

**משימה 0 (בוצע: dade448 + סבב סקירה 4a2f1ed, 451 בדיקות):** הסקירה היחידה תפסה שפיצול הנקודות המקורי (15+5) לא היה שמר-ציונים: עסק בלי אתר עלה מ-84 ל-86, אתר מת קיבל שבח "אתר עצמאי", ועסק-פייסבוק-בלבד הפך לגבוה מכולם כי דילוג הסריקה מחק את סימני הכישלון. התיקון: היפוך ל-5 (has_website) + 15 (own_website), own_website תמיד במכנה, earned נגזר מ-hasWebsiteEarned עם שלילת נוכחות חברתית (כולל fallback לזיהוי מחדש בשורות ישנות). זהות: identityPathOf פר-פלטפורמה (profile.php לפי id, send לפי phone, watch לפי v, שני מקטעים אחרי pages/p/company/in) + איחוד תתי-דומיין m/web/business. אומת על נתונים חיים: כל 7 העסקים הלא-חברתיים זהים אחד-לאחד, הסוציאלי ירד 31 אל 19 במכוון.

**משימה 0.5 (בוצע: 897d5ab + f1a1de8, 436 בדיקות בזמנו):** קומבו-בוקס מסנן חי עם a11y מלא + חיפוש חוזר בטקסט מורחב; כתובת אתר מפעילה חיפוש מפות עם "סריקת האתר בלבד" כמילוט. חידוד מבדיקה חיה של להב (הדביק קישור profile.php וקיבל רעש): קישור חברתי עם שם בכתובת מחפש את השם המפוענח; בלי שם (profile.php, מספרי) - בלי קריאת Places בכלל, הודעה כנה עם שתי אפשרויות.

**משימה 1 (בוצע: 6311756 + סבב סקירה 4ea57c1, 510 בדיקות):** ממד בשלות התהליכים חי - שלושה חוקים שנבנים מהמודל עם ציטוטי הבעלים, וריענון ציונים אוטומטי בסיום ראיון (כתיבה עמידה, לא מפילה סיום שהצליח). הסקירה תפסה עיקרון חשוב: אסור לחוק לקרוא שם שדה בודד שה-LLM בחר - כל החוקים קוראים את מלוא הטקסט שדווח בסקציה עם ביטויי שלילה. אינווריאנט אפס-מודל אומת חיצונית מול הקומיט הקודם.

**משימה 0.7 (בוצע: 0fe876c, 510 בדיקות):** שתי מיגרציות (טלפון/כתובת לעסקים + raw JSONB לסריקות; updatedAt לכל הטבלאות - דרישת מייסד שקופלה תוך כדי). העשרת עסק אחרי סריקה (טלפון, כתובת, עיר נגזרת ב-cityOf), ו-raw payload שמור: Places מלא, PageSpeed מקוצץ, בלי HTML גולמי. בנוסף (עצמאי): מיגרציית move_vector_to_extensions_schema - סגירת אזהרת האבטחה של Supabase על pgvector בסכמה public.
