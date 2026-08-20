import Link from "next/link";
import { SERVICE_TYPES, SERVICE_TYPE_LABEL_HE } from "../../../pipeline/roadmap/service-type";
import { INDUSTRIES, INDUSTRY_LABEL_HE } from "../../../pipeline/industry";
import { CATALOG_PHASES, COMPLEXITIES } from "../../../server/api/admin-catalog-handler";
import { RULE_LABEL_HE } from "../../../pipeline/report/presenter";
import type { CatalogItemDetail } from "../../../server/catalog-admin";
import { DATE_FMT } from "../labels";

const PHASE_LABEL: Record<string, string> = {
  quick_wins: "צעדים מהירים",
  automation: "אוטומציה",
  ai: "AI",
  transformation: "טרנספורמציה",
};

const COMPLEXITY_LABEL: Record<string, string> = { low: "נמוכה", medium: "בינונית", high: "גבוהה" };

// טופס פריט הספרייה. HTML רגיל בלי JS: הוא נשלח, השרת מאמת, ומחזיר הפניה עם הודעה.
// זה גם מה שעובד הכי מהר וגם מה שעובד כשהרשת גרועה - ומסך ניהול נערך לפעמים מהטלפון.
//
// item = null: יצירת פריט חדש. אחרת עריכה, והבנצ'מרקים מנוהלים בטפסים נפרדים למטה
// (הוספה ומחיקה הן פעולות עצמאיות ולא חלק מהשמירה של הפריט)
export function CatalogForm({
  item, gapKeyOptions,
}: {
  item: CatalogItemDetail | null;
  gapKeyOptions: string[];
}) {
  const isNew = item == null;
  const scoped = item?.industries != null && item.industries.length > 0;

  return (
    <>
      <form method="post" action="/api/admin/catalog" className="cform">
        {!isNew && <input type="hidden" name="id" value={item.id} />}
        <input type="hidden" name="action" value="save" />

        <div className="cf-grid">
          <label className="cf-fld cf-wide">
            <span>שם השירות</span>
            <input name="name" defaultValue={item?.name ?? ""} required maxLength={120} />
          </label>

          <label className="cf-fld cf-wide">
            <span>הבעיה שהוא פותר, בשפה של בעל העסק</span>
            <textarea name="problem" defaultValue={item?.problem ?? ""} rows={2} required />
          </label>

          <label className="cf-fld cf-wide">
            <span>מה בפועל מקבלים</span>
            <textarea name="solution" defaultValue={item?.solution ?? ""} rows={2} required />
          </label>

          <label className="cf-fld">
            <span>סוג שירות</span>
            <select name="serviceType" defaultValue={item?.serviceType ?? ""}>
              <option value="">לא מסווג</option>
              {SERVICE_TYPES.map((t) => (
                <option key={t} value={t}>{SERVICE_TYPE_LABEL_HE[t]}</option>
              ))}
            </select>
          </label>

          <label className="cf-fld">
            <span>שלב בתוכנית העבודה</span>
            <select name="phase" defaultValue={item?.phase ?? ""}>
              <option value="">ברירת מחדל</option>
              {CATALOG_PHASES.map((p) => (
                <option key={p} value={p}>{PHASE_LABEL[p]}</option>
              ))}
            </select>
          </label>

          <label className="cf-fld">
            <span>מורכבות</span>
            <select name="complexity" defaultValue={item?.complexity ?? "low"} required>
              {COMPLEXITIES.map((c) => (
                <option key={c} value={c}>{COMPLEXITY_LABEL[c]}</option>
              ))}
            </select>
          </label>

          <label className="cf-fld">
            <span>זמן הטמעה</span>
            <input name="installTime" defaultValue={item?.installTime ?? ""} required />
          </label>

          <label className="cf-fld cf-wide">
            <span>טווח מחיר</span>
            <input name="costRange" defaultValue={item?.costRange ?? ""} required />
          </label>

          <label className="cf-fld cf-wide">
            <span>מה זה חוסך או מכניס</span>
            <input name="savingRange" defaultValue={item?.savingRange ?? ""} required />
          </label>
        </div>

        <fieldset className="cf-set">
          <legend>מתי להציע את השירות</legend>
          <p className="cf-hint">
            השירות יוצע לעסק שיש לו לפחות אחד מהפערים שסומנו. בלי אף פער הוא לא יותאם לאיש.
          </p>
          <div className="cf-checks">
            {gapKeyOptions.map((key) => (
              <label key={key} className="cf-chk">
                <input
                  type="checkbox" name="gapKeys" value={key}
                  defaultChecked={item?.gapKeys.includes(key) ?? false}
                />
                <span>{RULE_LABEL_HE[key] ?? key}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="cf-set">
          <legend>לאיזה ענפים</legend>
          <p className="cf-hint">
            בלי סימון - השירות מוצע לכל עסק. עם סימון הוא יוצע רק לענפים שנבחרו, ולא יוצע
            כלל לעסק שהענף שלו לא זוהה.
          </p>
          <label className="cf-chk cf-chk-lead">
            <input type="checkbox" name="industryScoped" value="1" defaultChecked={scoped} />
            <span>השירות מיועד לענפים מסוימים</span>
          </label>
          <div className="cf-checks">
            {INDUSTRIES.map((slug) => (
              <label key={slug} className="cf-chk">
                <input
                  type="checkbox" name="industries" value={slug}
                  defaultChecked={item?.industries.includes(slug) ?? false}
                />
                <span>{INDUSTRY_LABEL_HE[slug]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="cf-act">
          <button type="submit" className="btn sm">{isNew ? "יצירת השירות" : "שמירה"}</button>
          <Link href="/admin/catalog" className="clear">ביטול</Link>
        </div>
      </form>

      {!isNew && (
        <>
          <section className="cf-bench">
            <h3 className="card-title">המקורות שמאחורי המחיר</h3>
            <p className="cf-hint">
              כל טווח שמוצג ללקוח נשען על השורות האלה. פריט בלי אף מקור מסומן באדום ברשימה -
              מחיר בלי מקור הוא בדיוק מה שאסור להציג.
            </p>

            {item.benchmarks.length === 0 ? (
              <p className="t-empty" style={{ color: "var(--bad)" }}>אין עדיין אף מקור לשירות הזה.</p>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>מדד</th><th>טווח</th><th>מקור</th><th>אומת</th><th></th></tr>
                  </thead>
                  <tbody>
                    {item.benchmarks.map((b) => (
                      <tr key={b.id}>
                        <td className="t-strong">{b.metric}</td>
                        <td>{b.range}</td>
                        <td className="t-mut">{b.source}</td>
                        <td className="t-mut num">{DATE_FMT.format(b.verifiedAt)}</td>
                        <td>
                          <form method="post" action="/api/admin/catalog">
                            <input type="hidden" name="action" value="benchmark_remove" />
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="benchmarkId" value={b.id} />
                            <button type="submit" className="ghost-act">מחיקה</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <form method="post" action="/api/admin/catalog" className="cf-benchadd">
              <input type="hidden" name="action" value="benchmark_add" />
              <input type="hidden" name="id" value={item.id} />
              <label className="cf-fld"><span>מדד</span><input name="metric" required /></label>
              <label className="cf-fld"><span>טווח</span><input name="range" required /></label>
              <label className="cf-fld cf-wide"><span>מקור</span><input name="source" required placeholder="שם הספק או הכתובת שנבדקה" /></label>
              <label className="cf-fld"><span>תאריך אימות</span><input type="date" name="verifiedAt" /></label>
              <button type="submit" className="btn sm">הוספת מקור</button>
            </form>
          </section>

          <form method="post" action="/api/admin/catalog" className="cf-danger">
            <input type="hidden" name="action" value={item.archivedAt == null ? "archive" : "restore"} />
            <input type="hidden" name="id" value={item.id} />
            <div>
              <b>{item.archivedAt == null ? "ארכוב השירות" : "החזרת השירות לספרייה"}</b>
              <p className="cf-hint">
                {item.archivedAt == null
                  ? "שירות מארוכב מפסיק להיות מוצע בתוכניות עבודה חדשות, ונשאר בתוכניות שכבר נבנו. אין מחיקה קשה - היא הייתה שוברת תוכניות של לקוחות קיימים."
                  : "השירות יחזור להיות מוצע בתוכניות עבודה חדשות."}
              </p>
            </div>
            <button type="submit" className="ghost-act">
              {item.archivedAt == null ? "ארכוב" : "החזרה"}
            </button>
          </form>
        </>
      )}
    </>
  );
}
