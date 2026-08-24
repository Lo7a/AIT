import Link from "next/link";
import { prisma } from "../../../server/db";
import {
  listBoard, listMessagesPaged, AUTHOR_NAMES, AUTHOR_LABEL_HE,
  isAuthorName, authorLabel as label, type AuthorName,
} from "../../../server/agent-chat";
import { pageParam } from "../../../server/paging";
import { requireAdmin } from "../require-admin";
import { Pager } from "../../ui/pager";
import { DATE_FMT } from "../labels";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined): string[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

// צבע זהות לכל כותב - העין מזהה מי מדבר בלי לקרוא את השם (שיפור מייסד 21.8).
// הסגול של המותג לקלוד של להב, הברקת לקלוד של אלעד, הענבר למייסדים
const AUTHOR_COLOR: Record<string, string> = {
  "lahav-claude": "var(--acc-soft)",
  "elad-claude": "var(--acc2-soft)",
  founder: "var(--warn)",
};

// ערוץ הסוכנים (הכרעת מייסד 21.8): מה שהקלוד של להב והקלוד של אלעד אומרים זה לזה,
// בלי לפתוח טרמינל. המסך קורא בלבד ולא מסמן "נקרא" - הסימון שייך לסוכנים; המייסד
// שכותב מכאן נרשם כ-founder, והחשבון ששלח נרשם באירוע agent_message_sent ביומן.
// ההודעות בעמודים של 20 עם סינון לפי כותב וחיפוש - חדשות קודם, כמו יומן
export default async function AdminAgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const authors = many(sp.author).filter(isAuthorName);
  const q = one(sp.q) ?? "";
  const sent = one(sp.sent) === "1";
  const page = pageParam(one(sp.page));
  const filtered = authors.length > 0 || q !== "";

  const [{ statuses }, list] = await Promise.all([
    listBoard(prisma),
    listMessagesPaged(prisma, { authors, q: q || undefined }, page),
  ]);
  const pagerParams = {
    q: q || undefined,
    author: authors.length > 0 ? authors : undefined,
  };

  return (
    <main className="board">
      <section className="shell c12 rv d1">
        <div className="core card-pad">
          <h2 className="card-title">לוח המצב</h2>
          {statuses.length === 0 ? (
            <p className="t-empty" style={{ color: "var(--mut)" }}>אף סוכן עוד לא עדכן מצב.</p>
          ) : (
            <div className="facts wide">
              {statuses.map((s) => (
                <div key={s.agent} className="f">
                  <span className="k" style={{ color: AUTHOR_COLOR[s.agent] }}>
                    {label(s.agent)} · {DATE_FMT.format(s.updatedAt)}
                  </span>
                  <span className="v">
                    {s.task}
                    <span className="block text-xs" style={{ color: "var(--dim)" }}>נוגע ב: {s.areas}</span>
                    {s.blockedOn != null && (
                      <span className="block text-xs" style={{ color: "var(--warn)" }}>חסום על: {s.blockedOn}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="shell c12 rv d2">
        <div className="core card-pad">
          <h2 className="card-title">השיח</h2>

          <form method="get" action="/admin/agents" className="mb-4 flex flex-col gap-2.5">
            <div className="fbar" style={{ marginBottom: 0 }}>
              <span className="fld" style={{ flex: 1 }}>
                <label htmlFor="ag-q">חיפוש</label>
                <input id="ag-q" type="search" name="q" defaultValue={q} placeholder="טקסט בהודעות" />
              </span>
              <span className="fbar-act">
                <button type="submit" className="btn sm">סינון</button>
                {filtered && <Link href="/admin/agents" className="clear">ניקוי</Link>}
              </span>
            </div>
            <div className="fchips">
              <span className="fchips-cap">כותב</span>
              {AUTHOR_NAMES.map((a) => (
                <label key={a} className="fchip">
                  <input type="checkbox" name="author" value={a} defaultChecked={authors.includes(a as AuthorName)} />
                  <span>{AUTHOR_LABEL_HE[a]}</span>
                </label>
              ))}
            </div>
          </form>

          {list.rows.length === 0 ? (
            <p className="t-empty" style={{ color: "var(--mut)" }}>
              {filtered ? "אין הודעות שמתאימות לסינון." : "אין עדיין הודעות."}
            </p>
          ) : (
            <ul>
              {list.rows.map((m) => (
                <li key={m.id} className="border-t py-3 first:border-t-0" style={{ borderColor: "var(--row-line)" }}>
                  <p className="flex flex-wrap items-baseline gap-2 text-xs">
                    <span className="font-bold" style={{ color: AUTHOR_COLOR[m.author] ?? "var(--txt)" }}>
                      {label(m.author)}
                    </span>
                    <span className="num" style={{ color: "var(--dim)" }}>{DATE_FMT.format(m.createdAt)}</span>
                    {m.thread !== "general" && (
                      <span className="rounded-full border px-2 py-0.5 text-[10.5px] font-semibold"
                        style={{ borderColor: "var(--hair-soft)", color: "var(--dim)" }}>
                        {m.thread}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 max-w-[78ch] whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
                </li>
              ))}
            </ul>
          )}

          <Pager
            page={list.page} pages={list.pages} total={list.total}
            basePath="/admin/agents" params={pagerParams} unit="הודעות"
          />

          {sent && (
            <p className="mt-3 text-xs font-semibold" style={{ color: "var(--acc2-soft)" }}>
              ההודעה נשלחה - הסוכנים יראו אותה בקריאה הבאה שלהם.
            </p>
          )}

          <form className="fbar mt-4" method="post" action="/api/admin/agent-chat">
            <span className="fld" style={{ flex: 1 }}>
              <label htmlFor="ag-body">הודעה לסוכנים</label>
              <input id="ag-body" name="body" type="text" required maxLength={2000} placeholder="נכתבת בשם מייסד; הסוכנים קוראים בתחילת כל סשן" />
            </span>
            <span className="fbar-act">
              <button type="submit" className="btn sm">שליחה</button>
            </span>
          </form>
        </div>
      </section>
    </main>
  );
}
