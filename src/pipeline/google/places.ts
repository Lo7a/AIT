import type { BusinessCandidate, PlaceDetails, Review } from "../types";
import type { FetchLike } from "../http";
import { defaultFetch, readErrorBody } from "../http";

export interface PlacesOptions {
  apiKey?: string;
  fetchImpl?: FetchLike;
}

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_URL = "https://places.googleapis.com/v1/places";
const TIMEOUT_MS = 20_000;

function resolveOpts(opts: PlacesOptions) {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not set");
  const fetchImpl: FetchLike = opts.fetchImpl ?? defaultFetch;
  return { apiKey, fetchImpl };
}

export async function searchBusiness(
  query: string,
  opts: PlacesOptions = {},
): Promise<BusinessCandidate[]> {
  const { apiKey, fetchImpl } = resolveOpts(opts);
  const res = await fetchImpl(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
    },
    body: JSON.stringify({ textQuery: query, languageCode: "he", regionCode: "IL" }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Places search HTTP ${res.status}: ${await readErrorBody(res)}`);
  const body = (await res.json()) as {
    places?: {
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
    }[];
  };
  return (body.places ?? []).map((p) => ({
    placeId: p.id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    rating: p.rating,
    reviewCount: p.userRatingCount,
  }));
}

export async function getPlaceDetails(
  placeId: string,
  opts: PlacesOptions = {},
): Promise<PlaceDetails> {
  const { apiKey, fetchImpl } = resolveOpts(opts);
  const fieldMask =
    "id,displayName,nationalPhoneNumber,websiteUri,rating,userRatingCount,reviews";
  const res = await fetchImpl(
    `${DETAILS_URL}/${encodeURIComponent(placeId)}?languageCode=he`,
    {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`Places details HTTP ${res.status}: ${await readErrorBody(res)}`);
  const body = (await res.json()) as {
    id: string;
    displayName?: { text?: string };
    nationalPhoneNumber?: string;
    websiteUri?: string;
    rating?: number;
    userRatingCount?: number;
    reviews?: {
      rating?: number;
      text?: { text?: string };
      originalText?: { text?: string };
      relativePublishTimeDescription?: string;
    }[];
  };
  const reviews: Review[] = (body.reviews ?? [])
    .map((r) => ({
      // 0 = ערך זקיף לביקורת ללא דירוג (ה-API כמעט תמיד מחזיר 1-5)
      rating: r.rating ?? 0,
      // מעדיפים את text (מתורגם ל-he) על originalText כדי שהניתוח יעבוד בעברית
      text: (r.text?.text || r.originalText?.text || "").trim(),
      relativeTime: r.relativePublishTimeDescription,
    }))
    .filter((r) => r.text.length > 0);
  return {
    placeId: body.id,
    name: body.displayName?.text ?? "",
    phone: body.nationalPhoneNumber,
    website: body.websiteUri,
    rating: body.rating,
    reviewCount: body.userRatingCount,
    reviews,
  };
}
