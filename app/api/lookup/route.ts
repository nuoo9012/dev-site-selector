// POST /api/lookup — 지번 주소로 필지 하나(또는 몇 개)의 정보를 찾아 돌려준다
// 선별 조건과 상관없이 필지의 모든 정보(지목·면적·용도지역·소유구분·토지이용상황·지형형상)를 보여주는 용도다.
// 검색어는 서버에서 해석·검사하고(lib/address-search.ts), DB에는 변수로만 넘긴다.

import { parseAddressQuery } from "@/lib/address-search";
import { findByAddress } from "@/lib/parcel-store";
import { storeErrorResponse } from "@/lib/store-error";
import { LOOKUP_LIMIT, type ApiError, type LookupResponse } from "@/lib/types";

function badQuery(message: string): Response {
  const body: ApiError = { error: { code: "INVALID_QUERY", message } };
  return Response.json(body, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return badQuery("검색어를 읽지 못했어요. JSON 형식으로 보내 주세요.");
  }

  const parsed = parseAddressQuery((input as { query?: unknown } | null)?.query);
  if (!parsed.ok) return badQuery(parsed.message);

  try {
    const body: LookupResponse = await findByAddress(parsed, LOOKUP_LIMIT);
    return Response.json(body);
  } catch (error) {
    const response = storeErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
