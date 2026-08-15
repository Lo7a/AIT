import type { RoadmapItemView, RoadmapView } from "../../server/roadmap-repo";
import type { Phase } from "../../pipeline/roadmap/opportunity-score";

// לוגיקה טהורה של מסך ה-Roadmap (אבן דרך 4, משימה 8) - בלי React ובלי fetch, כך שגרסת עיצוב
// עתידית תחליף רק JSX/CSS בלי לגעת כאן. use-roadmap.ts הוא השכבה היחידה שקוראת ל-API ומתרגמת
// תשובות שרת לפעולות על ה-reducer הזה. אותו דפוס בדיוק כמו interview/chat-logic.ts.

export const PHASE_ORDER: Phase[] = ["quick_wins", "automation", "ai", "transformation"];
export const PHASE_LABEL: Record<Phase, string> = {
  quick_wins: "Quick Wins",
  automation: "אוטומציה",
  ai: "AI",
  transformation: "טרנספורמציה",
};

export interface PhaseGroup {
  phase: Phase;
  label: string;
  items: RoadmapItemView[];
}

// פריטים מגיעים מהשרת ממוינים כבר (score יורד, ואז שם - ראו roadmap-repo.ts) - הקיבוץ כאן שומר
// על הסדר הזה בתוך כל קבוצה, לא ממיין מחדש. "transformation" לא מופיע היום באף פריט קטלוג אמיתי
// (ראו opportunity-score.ts) אבל הקיבוץ תומך בו מבנית; קבוצה ריקה פשוט לא מוצגת (המסך לא מציג
// כותרת שלב בלי אף כרטיס מתחתיה)
export function groupByPhase(items: RoadmapItemView[]): PhaseGroup[] {
  return PHASE_ORDER
    .map((phase) => ({ phase, label: PHASE_LABEL[phase], items: items.filter((i) => i.phase === phase) }))
    .filter((g) => g.items.length > 0);
}

// תיקון ממצא שער יציאה אבן דרך 4, בדיקה 2 - "ממצא 2" (docs/milestone-4-gate.md): הכרטיס הציג את
// item.problem מהקטלוג כלשונו מתחת לשם הפריט, גם לפריט שנכנס רק על כאב הבעלים (confidence="low",
// אפס ראיות כמותיות - matching.ts, כלל הכניסה). ה-problem הוא ניסוח תחום כללי ("אין דרך מהירה
// לפנות לעסק") שיכול לסתור ישירות את מצב העסק בפועל (מקרה חי: עסק שכן יש לו וואטסאפ קיבל בדיוק
// את הטענה הזו). ה-reasoning מעוגן-הציטוט הוא הטקסט הכן היחיד לפריט כזה, בלי הטענה הגנרית לצידו.
export function shouldShowCatalogProblem(item: Pick<RoadmapItemView, "confidence">): boolean {
  return item.confidence !== "low";
}

export type BuildPhase = "idle" | "building" | "ready" | "error";
export type ItemBriefStatus = "idle" | "sending" | "requested" | "error";

export interface RoadmapScreenState {
  buildPhase: BuildPhase;
  roadmap: RoadmapView | null;
  error: string | null;
  // מצב מקומי פר-פריט של בקשת ה-Brief ("אני רוצה להטמיע את זה") - נזרע מ-item.status שהשרת
  // כבר שלח (roadmap_ready עם Brief קודם מתחיל ב-"requested"), ומתעדכן אופטימית-מאושרת אחרי POST
  itemBrief: Record<string, ItemBriefStatus>;
  itemError: Record<string, string>;
}

function seedItemBrief(roadmap: RoadmapView | null): Record<string, ItemBriefStatus> {
  const map: Record<string, ItemBriefStatus> = {};
  if (roadmap) for (const it of roadmap.items) map[it.id] = it.status === "requested" ? "requested" : "idle";
  return map;
}

// initial מגיע מה-RSC (getRoadmapView שכבר רץ בצד שרת) - null כשאין עדיין Roadmap בכלל, ואז
// buildPhase="idle" מסמן להוק להריץ בנייה אוטומטית (ראו use-roadmap.ts)
export function initialRoadmapState(initial: RoadmapView | null): RoadmapScreenState {
  return {
    buildPhase: initial ? "ready" : "idle",
    roadmap: initial,
    error: null,
    itemBrief: seedItemBrief(initial),
    itemError: {},
  };
}

export type RoadmapScreenAction =
  | { type: "buildStart" }
  | { type: "buildOk"; payload: RoadmapView }
  | { type: "buildFail"; error: string }
  | { type: "itemSendStart"; itemId: string }
  | { type: "itemSendOk"; itemId: string }
  | { type: "itemSendFail"; itemId: string; error: string };

export function roadmapReducer(state: RoadmapScreenState, action: RoadmapScreenAction): RoadmapScreenState {
  switch (action.type) {
    case "buildStart":
      return { ...state, buildPhase: "building", error: null };

    // buildOk גם אחרי חישוב מחדש: Roadmap חדש נוצר בכל קריאה (roadmap-repo.ts - "מחושב מחדש" הוא
    // הזרימה הרגילה), אז itemBrief נזרע מחדש מהפריטים החדשים - לא שומר מצב "requested" ישן שכבר
    // לא שייך לאף פריט קיים
    case "buildOk":
      return {
        ...state, buildPhase: "ready", roadmap: action.payload, error: null, itemBrief: seedItemBrief(action.payload),
      };

    case "buildFail":
      return { ...state, buildPhase: "error", error: action.error };

    case "itemSendStart":
      return {
        ...state,
        itemBrief: { ...state.itemBrief, [action.itemId]: "sending" },
        itemError: { ...state.itemError, [action.itemId]: "" },
      };

    case "itemSendOk":
      return { ...state, itemBrief: { ...state.itemBrief, [action.itemId]: "requested" } };

    // כישלון שולח את הכפתור חזרה ל-idle (לא נשאר תקוע "בשליחה") כדי שאפשר יהיה לנסות שוב
    case "itemSendFail":
      return {
        ...state,
        itemBrief: { ...state.itemBrief, [action.itemId]: "idle" },
        itemError: { ...state.itemError, [action.itemId]: action.error },
      };

    default:
      return state;
  }
}
