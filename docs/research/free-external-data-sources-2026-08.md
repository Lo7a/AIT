# מקורות מידע חיצוניים חינמיים - מחקר ואימות, אוגוסט 2026

נחקר בסבב מרובה סוכנים (29 מועמדים נסחפו, 20 שרדו אימות). כל מועמד נבדק בקריאות חיות מול
התיעוד והשירות עצמו: האם באמת חינם, מה המכסות בפועל, האם יש כיסוי לישראל ולדומיינים
co.il, מה הסיכון בתנאי השימוש, כמה עבודה נדרשת, ומה בדיוק אפשר להגיד לבעל עסק בעברית
בזכות המקור - בלי מספר מומצא אחד.

מסמך זה הוא רשומה של הריפו, לא ערוץ קריאה של המייסד. ההחלטות עצמן נקבעות בצ'אט.

---

# AIT external data sources - decision brief

## 1. Ranked shortlist (value to effort)

**1. Overture Maps Places (local competitor benchmark)** - days
Sentence: "בתוך רדיוס של קילומטר ממך רשומים 236 עסקי טיפוח ויופי, ול-134 מהם יש אתר. לעסק שלך אין."
Work: monthly DuckDB extract of the Israel subset (18s, ~123k rows at confidence >= 0.5, ~31MB) into Supabase with a coordinate index; radius query at scan time is local SQL, zero external calls. **Prerequisite: add `location` to both field masks in `C:\Users\lahav\Desktop\AIT\src\pipeline\google\places.ts`** - it is an Essentials-tier field and both masks already request Enterprise fields, so Google bills nothing extra. Without it we have no coordinates.
Risk: must clip on `addresses.country = 'IL'` or the bbox pulls in Jordan, the West Bank and Lebanon (a third of rows, and it changes every benchmark materially). `operating_status` is null in Israel, so counts are "registered listings, approximate", never "active businesses". `socials` is 97-99% filled because 97% of rows come from Meta - block it from ever rendering as a benchmark. Build on `basic_category`, not `categories`, which is deleted in the September 2026 release.

**2. DNS email authentication (MX / SPF / DMARC)** - hours
Sentence: "הדואר שלך רץ על Google Workspace, קיימת רשומת SPF, ולא קיימת רשומת DMARC."
Work: `node:dns/promises` with the injected-resolver pattern already used in `src\pipeline\resolve-guard.ts`; MX vendor fingerprints mirror `signals.ts`. Maps onto known/earned in `score\dimensions.ts` cleanly (NOERROR/NXDOMAIN = known, SERVFAIL/timeout = "לא נבדק").
Risk: three coded guards are mandatory. NODATA vs NXDOMAIN are different findings. No MX plus an A record does not mean mail bounces (implicit MX). And the registrable-domain guard: a business on `mybiz.wixsite.com` would otherwise be reported with Wix's email posture as its own - `.co.il` makes this three labels, so a PSL/tldts dependency plus a builder denylist is required. Cut the "your mail lands in spam" clause: Google and Microsoft only require DMARC above 5,000 messages/day. Never say "X% of Israeli businesses" - no citable benchmark exists.

**3. LocalBusiness / JSON-LD parsing** - hours
Sentence: "בקוד של האתר שלך יש סימון של אתר ועמוד בלבד, בלי סוג של עסק מקומי, ולכן האתר לא מצהיר לגוגל כתובת ושעות פתיחה."
Work: cheerio is already imported in `signals.ts`; nothing new is fetched. Walk the real 130-descendant LocalBusiness subtree from the schema.org dump rather than hand-listing types (a hand list misses `CafeOrCoffeeShop` and falsely accuses a real cafe). Read microdata `itemtype` too, not just JSON-LD.
Risk: gate the negative on the existing `jsRendered` flag - a JS-injected block is valid to Google and invisible to our crawler, so that case is "לא נבדק". Never attach a traffic or click number; Google states outright it does not guarantee rich results. Frame as eligibility only. Tell the owner to mark up their real visible hours, never a template.

**4. ISOC-IL WHOIS (.il domain expiry and age)** - hours
Sentence: "הדומיין שלך רשום עד 29-11-2026, כלומר עוד 103 ימים."
Work: raw TCP to `whois.isoc.org.il:43` via `node:net`, regex five whitelisted keys, discard the rest, cache 30d+.
Risk: **test port 43 egress on a Vercel preview before wiring it in.** Expiry is present in only 81% of registered domains (7 legacy pre-1999 ones return the literal string `validity: N/A`, which must render "לא נבדק", not as a gap). Do not claim the site dies on the expiry date - ISOC-IL runs a 30 to 120 day gradual revocation. Store only the parsed whitelist, not the raw response: it contains admin/tech PII today, which is the one deliberate exception to the full-payload-retention rule (the 1 September 2026 policy change removes most of it anyway). Drop transfer-lock (37/37 identical) and demote DNSSEC (1/37 signed, and not SMB-actionable).

**5. CrUX field data already inside the PageSpeed response** - hours
Sentence: "לפי מדידת גולשים אמיתיים של גוגל, אצל 75 אחוז מהמבקרים הדף נטען תוך 1.28 שניות או פחות."
Work: `src\pipeline\google\pagespeed.ts:42` already stores `loadingExperience` and types it `unknown`; `originLoadingExperience` is not captured at all. Delete the `unknown`, add the origin field to trimRaw, gate the performance gap in `dimensions.ts`. Probe both `www.` and bare-domain variants or coverage is undercounted.
Risk: coverage is the constraint, not correctness - 0 of 5 real Israeli SMB domains had any data. Ship it as a **suppressor**, not a promised feature. When absent, label "לא נבדק: אין מספיק תנועה", and never infer "your site has no traffic" (eligibility also depends on indexability and Google publishes no threshold).
This is the only item on the list that fixes an active correctness bug: three sites measured lab-slow (LCP 8.0s, 15.9s, 53.4s) were FAST for real users (1.28s, 1.58s, 1.90s). Today AIT would falsely accuse all three.

**6. רשם החברות - ica_companies (מפרה status)** - days
Sentence: "העסק רשום ברשם החברות כחברה מפרה. הדוח השנתי האחרון שהוגש הוא לשנת 2022."
Work: keyless CKAN `datastore_search`. The real work is guardrails: tilde normalization (`בע~מ`), DD/MM/YYYY parsing, explicit UTF-8 percent-encoding of Hebrew filters, snapshot-date display.
Risk: **exact ח.פ. only.** Free-text `q=` searches every field and returns confident wrong answers (`q=ארומה` returns an unrelated company matched on its c/o field). Telling the wrong owner they are a חברה מפרה is the worst failure this product can produce. Add a ח.פ. question to the interview; opportunistic footer regex works but misses most JS-rendered sites. עוסק מורשה and עוסק פטור have no registry row at all - "לא נבדק", never "no problem found". Hit rate when it does fire is high: 176,659 companies are both פעילה and מפרה (43.6% of active).

**7. Google Web Risk (uris.search)** - hours
Sentence when clean: "האתר שלך לא נמצא ברשימת האתרים המסוכנים של גוגל בבדיקה שנעשתה עכשיו. זה לא אישור אבטחה."
Work: incremental API enablement on the existing billed GCP project. Free to 100k calls/month.
Risk: `uris.search` only - `hashes.search` is $50 per 1,000 with no free tier. Mandatory display rules: qualifying language ("עלול"), "Advisory provided by Google" attribution, and the advisory notice. And a hit may only be shown while the cached response is fresh, so **this one field must be re-checked at report render time**, a deliberate exception to scan reuse. Fires rarely; treat as low-frequency, high-severity.

**8. TLS certificate handshake** - hours - build it for chain validity (`authorized` / `authorizationError`), SAN apex-vs-www coverage, and CDN/WAF fingerprinting (cellcom.co.il presents CN `imperva.com`), which works on JS-heavy sites where the crawler is blind. Do **not** sell it on expiry: 7 of 7 Israeli SMBs sampled are on 90-day auto-renewing certs, and CA/B Forum caps are shrinking lifetimes to 47 days by 2029. Drop the TLS-version claim entirely - `getProtocol()` only reports the negotiated version, and downgrade probes fail client-side on Node 22 in a way naive code cannot distinguish from a server refusal. It cannot piggyback on the crawl (undici does not expose the peer cert), so route the separate `tls.connect` through `isForbiddenHost` and `assertResolvesPublic` or it silently bypasses the SSRF layer.

**9. HTTP response headers** - hours - the crawler's `FetchedPage` discards the headers object it already holds. Lead with `Server` as a hosting-layer fingerprint feeding `signals.ts`; that tells the roadmap whether a fix is even possible. Treat the security headers as a low-priority observation: Wix cannot set them at all, so the roadmap would hand a large share of users a task they are structurally unable to do. Read the final 200 hop, not the redirect. Accept `frame-ancestors` OR `X-Frame-Options` (a CSP with only `frame-src` is not protection).

**10. sitemap declared-but-broken** - hours, unscored bug-catcher only. "בקובץ robots.txt מוצהרת כתובת של מפת אתר שמחזירה שגיאה 404." Probe alternate sitemap paths first, and re-verify on a second spaced fetch before speaking - single-shot 5xx happens. Absence of robots.txt or sitemap is not a gap (12/12 have both).

Below the line for now: CrUX History (depends on #5, needs the same console toggle, and adjacent weekly periods share 27 of 28 days so trends need >= 4 weeks separation), רשם העמותות (high value but only for the ~39k nonprofit slice, ship as a conditional branch), fire-safety `businessreq` (off-mission, interview-driven, empty for sub-300sqm service businesses).

## 2. Ships this week - nothing but code, no keys, no approval

DNS auth records, LocalBusiness JSON-LD, TLS handshake, HTTP headers, sitemap bug-catcher, and the CrUX read out of the PSI payload. All six are pure local work on data we already fetch or on `node:dns` / `node:net` / `node:tls`, which already ship to production via `crawl.ts` and `resolve-guard.ts`. ISOC-IL WHOIS is also key-free but needs one preview-deployment test that port 43 egress works.

Two console toggles, not keys, and both free: enable `webrisk.googleapis.com` and `chromeuxreport.googleapis.com` on the existing project (currently 403 SERVICE_DISABLED). Your call, since it changes your GCP config.

## 3. Owner-connected sources and the flow

All of these are post-signup enrichment. None can appear in the cold scan that sells the product, which is the single most important thing to internalize before budgeting time for them.

Flow: one "חבר את החשבונות שלך" step after signup, one Google OAuth consent covering `analytics.readonly` + `webmasters.readonly`, encrypted refresh-token storage, a property/account picker (GA4 `accountSummaries.list`, GSC `sites.list`), and clean degradation to "לא מחובר" everywhere. Plan a single OAuth verification submission covering all Google scopes at once - it is per-application, not per-scope, needs a public homepage, a privacy policy on the same domain, domain ownership proven via Search Console, and an English demo video, taking up to 10 days. Do not ship unverified: sensitive scopes carry a 100-new-user cap that applies for the lifetime of the project and can never be reset.

- **GA4 Data API** - the strongest of these and the only recommended one. Real behaviour numbers make the loss framing defensible. `properties.keyEvents.list` returns an empty list when none are configured, which mechanically distinguishes "not configured" from "zero conversions" rather than leaving it to discipline. Use `keyEvents` / `isKeyEvent`, not the deprecated `conversions` / `isConversionEvent`. ToS 5c means GA4 data for business A must never appear in business B's report or benchmark - enforce that at the schema level before the competitor feature exists.
- **GSC Search Analytics + URL Inspection** - the mobile-vs-desktop average-position gap connects directly to the PageSpeed mobile score we already measure, which is the best claim here. Query-level data is heavily anonymized for exactly the smallest businesses. An empty `sites.list` means "לא נמצאה גישה", never "אין לך" - the property usually sits in the web developer's account. Add URL Inspection only once the GSC flow exists; alone it does not justify it.
- **Google Business Profile (Reviews, Performance, Search Keywords)** - richest of the three (reply rate, unanswered 1-star reviews with dates, and `updateReply` turns AIT from advisor into doer), but do not start yet. Two blockers: the `business.manage` OAuth 403 for all external users is confirmed open as of 17 Aug 2026 with no Google reply, and the API policies cap retention at 30 calendar days and state Content "cannot be manipulated or aggregated in any way", which collides head-on with full-payload retention and with the stored report. Before any engineering time: confirm AIT owns a verified GBP active 60+ days, and re-check that forum thread.

## 4. Do not do

- **Wayback CDX for staleness.** The digest is a hash of raw bytes; WordPress nonces and Redis metrics comments change every capture, so 86-98% of crawls register as "meaningful change". "האתר שלך לא השתנה 218 יום" is really a fact about the Internet Archive's crawl schedule. Our own crawler already fetches fresh on every scan - a normalized-text hash per scan is a strictly better, self-owned change detector.
- **Cert Spotter / CT logs.** Real, free, Israel-fine, and useless here: staging subdomains appear only at enterprises with dev teams. SAN pollution would tell a cafe owner that mcdonalds.co.il is their forgotten subdomain. The 10 full-domain queries/hour cap is global per account and would ceiling the whole product at 240 scans/day.
- **Accessibility enforcement dataset (supervisionfiles).** Last order sent November 2024, and rows are defect components, not businesses: 505 website rows resolve to 34 organizations.
- **Municipal business licences (Beer Sheva / Tel Aviv).** Only 3.3% of Beer Sheva licences expire within a year, Tel Aviv has no expiry field at all, so there is no city two.
- **OSM Overpass, Nominatim, Wikidata, IndexNow, ica-changes.** Coverage too thin, redundant with Places, or write-only.
- **Inside sources we are building:** no "X% of Israeli businesses have DMARC" comparison; no Overture `socials` benchmark; no traffic number attached to schema markup; no transfer-lock or DNSSEC findings; no TLS-version claim; no AI-crawler-blocking rule; no "no fire requirement means no licence required".

## 5. Highest-value source

**Overture Maps Places.**

Everything else describes one business in isolation, which is what we already do. This is the only source that tells an owner where they stand relative to the businesses around them, from a real measurement, and it is exactly the shape of number the report is built to lead with: "134 of the 236 beauty businesses within a kilometre of you have a website. You do not."

Four reasons it wins:

1. **It fires on every scan.** DMARC fires on maybe half, domain expiry on one in six, מפרה only when we have a ח.פ., CrUX for a small minority. A radius count exists for every business with coordinates, and coordinates are one free line of edit away in the Places field mask.
2. **It supplies sourced benchmarks, which the iron rules otherwise starve us of.** Israel-only, confidence-filtered: restaurant 9,769 / 49.2% have a website, personal_or_beauty_service 8,745 / 40.5%, dental_clinic 1,696 / 59.9%, attorney_or_law_firm 3,745 / 82.9%. And town-level: Tel Aviv 64.7%, Beer Sheva 51.2%, Ofakim 36.1%, Umm al-Fahm 25.5%. An Ofakim business gets compared to Ofakim, not to Dizengoff. That is fairer and more persuasive than any imported article figure.
3. **Zero scan-time cost or dependency.** It is a static monthly file, not an API. No key, no quota, no rate limit, no vendor that can gate it later, and no network hop from Frankfurt at scan time. CDLA-Permissive-2.0 explicitly places derived results outside its obligations, so commercial display is clean.
4. **It unlocks the competitor-comparison feature already on the roadmap** without a second integration.

The cost is days, not hours, and most of that is honesty plumbing rather than the pipe: country clipping, confidence filtering, blocking `socials`, labelling counts approximate because closed businesses are undetectable, handling 8.3% null categories, and doing radius maths on coordinates rather than joining on free-text town names (תל אביב appears in four spellings).

If you want something visible before that lands, ship DNS/DMARC and LocalBusiness markup first - both are hours, both are new dimensions, and both are pure local code.
