import { prisma } from "../../../server/db";
import { getExternalCallsSummary, listSettingOverrides } from "../../../server/admin-read";
import { EDITABLE_SETTINGS } from "../../../server/api/admin-settings-handler";
import { requireAdmin } from "../require-admin";
import { SETTING_LABEL } from "../labels";

export const dynamic = "force-dynamic";

// שדה מספר קצר בתוך שורת מגבלה. .field input בנוי לשדה חיפוש רחב עם אייקון, ולכן רק
// הריפוד והרוחב נדרסים כאן - הצבעים, המסגרת והפוקוס נשארים שלו
const LIMIT_INPUT_STYLE = { padding: "9px 13px", width: "104px" } as const;

// שימוש ומגבלות: המתגים שמרסנים את המערכת והחשבון של מה היא באמת צרכה. שני הדברים
// באותו מסך כי מסתכלים עליהם יחד - קופצת קריאות, מורידים מגבלה
export default async function AdminUsagePage() {
  await requireAdmin();

  const [externalCalls, overrides] = await Promise.all([
    getExternalCallsSummary(prisma),
    listSettingOverrides(prisma, EDITABLE_SETTINGS.map((s) => s.settingKey)),
  ]);

  return (
    <main className="board">
      <section className="shell c12 rv d1">
        <div className="core card-pad">
          <h2 className="card-title">מגבלות קצב</h2>
          <p className="text-sm" style={{ color: "var(--mut)" }}>
            שדה ריק = ברירת המחדל שבקוד. 0 = חסימה מלאה של הפעולה (מתג חירום). כל שינוי נרשם ביומן.
          </p>
          <form method="post" action="/api/admin/settings" className="mt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {EDITABLE_SETTINGS.map(({ settingKey, defaultLimit }) => (
                <label key={settingKey} className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium">
                    {SETTING_LABEL[settingKey] ?? settingKey}
                    <span className="text-xs" style={{ color: "var(--mut)" }}> (ברירת מחדל: {defaultLimit})</span>
                  </span>
                  <span className="field shrink-0">
                    <input
                      type="number"
                      name={settingKey}
                      min={0}
                      step={1}
                      defaultValue={overrides[settingKey] ?? ""}
                      placeholder={String(defaultLimit)}
                      className="num"
                      style={LIMIT_INPUT_STYLE}
                    />
                  </span>
                </label>
              ))}
            </div>
            <button type="submit" className="btn sm mt-6">
              שמירת מגבלות
              <span className="cap" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 13 4.5 4.5L19 7" />
                </svg>
              </span>
            </button>
          </form>
        </div>
      </section>

      <section className="shell c12 rv d2">
        <div className="core card-pad">
          <h2 className="card-title">קריאות חיצוניות וטוקנים (7 ימים)</h2>
          <p className="text-sm" style={{ color: "var(--mut)" }}>
            ביממה האחרונה: <span className="num font-bold" style={{ color: "var(--txt)" }}>{externalCalls.todayCalls}</span> קריאות,{" "}
            <span className="num font-bold" style={{ color: "var(--txt)" }}>{externalCalls.todayTokens.toLocaleString("he-IL")}</span> טוקנים
          </p>
          <div className="tbl-wrap mt-4">
            <table className="tbl">
              <thead>
                <tr>
                  <th>שירות</th>
                  <th>הקשר</th>
                  <th>קריאות</th>
                  <th>כשלים</th>
                  <th>טוקנים נכנסים</th>
                  <th>טוקנים יוצאים</th>
                  <th>משך ממוצע</th>
                </tr>
              </thead>
              <tbody>
                {externalCalls.last7d.length === 0 && (
                  <tr><td className="t-empty" colSpan={7}>אין עדיין קריאות בארכיון</td></tr>
                )}
                {externalCalls.last7d.map((s) => (
                  <tr key={`${s.service}:${s.context}`}>
                    <td className="t-strong" dir="ltr">{s.service}</td>
                    <td className="t-mut" dir="ltr">{s.context}</td>
                    <td className="num">{s.calls}</td>
                    {/* כשל אחד ומעלה נצבע - זו השורה היחידה שמחפשים בטבלה הזאת */}
                    <td className={s.failed > 0 ? "num t-bad" : "num t-mut"}>{s.failed}</td>
                    <td className="num">{s.inputTokens.toLocaleString("he-IL")}</td>
                    <td className="num">{s.outputTokens.toLocaleString("he-IL")}</td>
                    <td className="num t-mut">{(s.avgDurationMs / 1000).toFixed(1)} שנ&apos;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
