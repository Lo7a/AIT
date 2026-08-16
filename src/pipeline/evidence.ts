import type { ScanFindings } from "./types";

// פרדיקטי הראיות המשותפים - ההגדרה היחידה של "בדקנו באמת".
// כפילות של אלה בין מודולים היא בדיוק איך נולד באג הקרדיט של pains (סקירת משימה 7).
export const noGbp = (f: ScanFindings) => f.partial.includes("no_gbp");
export const crawlUsable = (f: ScanFindings) => !!f.websiteSignals && !f.partial.includes("js_rendered");
export const reviewsAnalyzed = (f: ScanFindings) => !!f.reviewInsights && f.reviewInsights.totalAnalyzed > 0;
