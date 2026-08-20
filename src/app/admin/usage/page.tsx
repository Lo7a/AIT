import Link from "next/link";
import { prisma } from "../../../server/db";
import { getExternalCallsSummary, getUsageSeries, listSettingOverrides } from "../../../server/admin-read";
import { EDITABLE_SETTINGS } from "../../../server/api/admin-settings-handler";
import { parseUsageRange, RANGE_LABEL, RANGE_KEYS } from "../../../server/usage-range";
import { requireAdmin } from "../require-admin";
import { BarChart, type BarPoint } from "../../ui/bar-chart";
import { SETTING_LABEL } from "../labels";

export const dynamic = "force-dynamic";

// שדה מספר קצר בתוך שורת מגבלה. .field input בנוי לשדה חיפוש רחב עם אייקון, ולכן רק
// הריפוד והרוחב נדרסים כאן - הצבעים, המסגרת והפוקוס נשארים שלו
const LIMIT_INPUT_STYLE = { padding: "9px 13px", width: "104px" } as const;

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

const HOUR_FMT = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" });
const DAY_FMT = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric" });

// תווית הדלי לפי הרזולוציה: שעה ליום בודד, תאריך לשאר. שבוע מסומן בתאריך תחילתו
const bucketLabel = (at: Date, bucket: string) =>
  bucket === "hour" ? HOUR_FMT.format(at) : DAY_FMT.format(at);

const nf = (n: number) => n.toLocaleString("he-IL");

// שימוש ומגבלות: המתגים שמרסנים את המערכת והחשבון של מה היא באמת צרכה. שני הדברים
// באותו מסך כי מסתכלים עליהם יחד - קופצת קריאות, מורידים מגבלה.
//
// הטווח נבחר ומשנה הכל (בקשת מייסד 20.8): הכרטיסים, שני הגרפים והטבלה קוראים את אותו
// חלון. הוא חי בכתובת, ולכן תצוגה מסוננת ניתנת לשיתוף ושורדת רענון
export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const fromParam = one(sp.from);
  const toParam = one(sp.to);
  const range = parseUsageRange({ range: one(sp.range), from: fromParam, to: toParam });

  const [externalCalls, series, overrides] = await Promise.all([
    getExternalCallsSummary(prisma, range),
    getUsageSeries(prisma, range),
    listSettingOverrides(prisma, EDITABLE_SETTINGS.map((s) => s.settingKey)),
  ]);

  // הסיכומים מחושבים מאותה סדרה שמציירת את הגרף - מספר על המסך שלא מסכים עם הגרף
  // שמעליו הוא בדיוק סוג הדבר שהורס אמון בדוח
  const totals = series.reduce(
    (acc, b) => ({
      calls: acc.calls + b.calls,
      failed: acc.failed + b.failed,
      tokens: acc.tokens + b.tokens,
    }),
    { calls: 0, failed: 0, tokens: 0 },
  );

  const callPoints: BarPoint[] = series.map((b) => ({
    label: bucketLabel(b.at, range.bucket),
    value: b.calls,
    alert: b.failed,
    title: `${bucketLabel(b.at, range.bucket)}: ${nf(b.calls)} קריאות, ${nf(b.failed)} כשלים`,
  }));
  const tokenPoints: BarPoint[] = series.map((b) => ({
    label: bucketLabel(b.at, range.bucket),
    value: b.tokens,
    title: `${bucketLabel(b.at, range.bucket)}: ${nf(b.tokens)} טוקנים`,
  }));

  const tiles = [
    { label: "קריאות בטווח", value: nf(totals.calls) },
    { label: "כשלים", value: nf(totals.failed), bad: totals.failed > 0 },
    { label: "טוקנים בטווח", value: nf(totals.tokens) },
    { label: "ביממה האחרונה", value: `${nf(externalCalls.todayCalls)} קריאות` },
  ];

  const presetHref = (k: string) => (k === "7d" ? "/admin/usage" : `/admin/usage?range=${k}`);

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

      {/* בורר הטווח. קישורים לקדם-מוגדרים וטופס GET לטווח מותאם - הכל דרך הכתובת,
          ולכן זה עובד גם לפני שה-JS נטען */}
      <section className="shell c12 rv d2">
        <div className="core card-pad">
          <h2 className="card-title flush">קריאות חיצוניות וטוקנים</h2>
          <p className="mt-1 mb-4 text-sm" style={{ color: "var(--mut)" }}>
            הטווח שנבחר: <b style={{ color: "var(--txt)" }}>{range.label}</b>. הכרטיסים, הגרפים והטבלה קוראים ממנו.
          </p>

          <nav className="rng" aria-label="טווח זמן">
            <span className="rng-presets">
              {RANGE_KEYS.filter((k) => k !== "custom").map((k) => (
                <Link key={k} href={presetHref(k)} className={range.key === k ? "on" : undefined}
                  aria-current={range.key === k ? "page" : undefined}>
                  {RANGE_LABEL[k]}
                </Link>
              ))}
            </span>
            <form method="get" action="/admin/usage">
              <input type="hidden" name="range" value="custom" />
              <label><span>מתאריך</span><input type="date" name="from" defaultValue={fromParam ?? ""} required /></label>
              <label><span>עד תאריך</span><input type="date" name="to" defaultValue={toParam ?? ""} required /></label>
              <button type="submit" className="btn sm">הצגה</button>
            </form>
          </nav>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="usage-tile">
                <span className="k">{t.label}</span>
                <span className={t.bad ? "v num t-bad" : "v num"}>{t.value}</span>
              </div>
            ))}
          </div>

          {/* שני גרפים ולא ציר כפול: קריאות וטוקנים נבדלים בסדרי גודל, וציר שני היה
              גורם לשתי הסדרות להיראות כאילו הן נחתכות במקומות שהן לא */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="chart-h">קריאות לאורך הזמן</h3>
              <BarChart points={callPoints} unitLabel="קריאות" alertLabel="כשלים" />
            </div>
            <div>
              <h3 className="chart-h">טוקנים לאורך הזמן</h3>
              <BarChart points={tokenPoints} unitLabel="טוקנים" />
            </div>
          </div>

          <div className="tbl-wrap mt-6">
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
                {externalCalls.byServiceContext.length === 0 && (
                  <tr><td className="t-empty" colSpan={7}>אין קריאות בטווח הזה</td></tr>
                )}
                {externalCalls.byServiceContext.map((s) => (
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
