import { searchBusiness } from "../../../pipeline/google/places";
import { makeSearchHandler } from "../../../server/api/search-handler";

export const POST = makeSearchHandler(searchBusiness);
