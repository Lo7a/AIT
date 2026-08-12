import * as cheerio from "cheerio";

export interface PageSignals {
  hasContactForm: boolean;
  hasWhatsappLink: boolean;
  hasPhoneLink: boolean;
  hasEmailLink: boolean;
  hasOnlineBooking: boolean;
  hasChatWidget: boolean;
  hasFacebookPixel: boolean;
  hasGoogleAnalytics: boolean;
  platform?: string;
  internalLinks: string[];
}

// פונקציה טהורה: HTML פנימה, סיגנלים החוצה. בלי רשת, בלי מצב.
export function extractSignals(html: string, baseUrl: string): PageSignals {
  const $ = cheerio.load(html);
  const raw = html.toLowerCase();
  const origin = new URL(baseUrl).origin;

  const internalLinks: string[] = [];
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    try {
      const abs = new URL(href, baseUrl);
      abs.hash = "";
      if (abs.origin === origin && abs.toString() !== baseUrl) {
        internalLinks.push(abs.toString());
      }
    } catch {
      // href לא תקין — מתעלמים
    }
  });

  let platform: string | undefined;
  if (raw.includes("wp-content") || raw.includes("wp-includes")) platform = "wordpress";
  else if (raw.includes("wixstatic.com") || raw.includes("wix.com")) platform = "wix";
  else if (raw.includes("cdn.shopify.com")) platform = "shopify";

  return {
    hasContactForm: $("form").length > 0,
    hasWhatsappLink: /wa\.me\/|api\.whatsapp\.com/.test(raw),
    hasPhoneLink: $('a[href^="tel:"]').length > 0,
    hasEmailLink: $('a[href^="mailto:"]').length > 0,
    hasOnlineBooking: /calendly|vcita|setmore|simplybook/.test(raw),
    hasChatWidget: /tawk\.to|tidio|intercom|crisp\.chat/.test(raw),
    hasFacebookPixel: /fbq\(|connect\.facebook\.net/.test(raw),
    hasGoogleAnalytics: /gtag\(|googletagmanager|google-analytics/.test(raw),
    platform,
    internalLinks: [...new Set(internalLinks)],
  };
}
