// 데이터베이스 쪽 문제를 API 오류 응답으로 바꾼다 (Design Ref: §7 오류 코드)
// 원래 오류 내용(접속 주소 등)은 응답에 담지 않고, 정해 둔 안내 문장만 보낸다.

import { DbError } from "./db";
import { TooManyResultsError } from "./parcel-store";
import type { ApiError } from "./types";

/** 알려진 DB 오류면 응답을, 아니면 null을 돌려준다 (모르는 오류는 그대로 던져 서버 로그에 남긴다) */
export function storeErrorResponse(error: unknown): Response | null {
  if (error instanceof TooManyResultsError) {
    const body: ApiError = {
      error: {
        code: "TOO_MANY_RESULTS",
        message: "조건에 맞을 수 있는 필지가 너무 많아요. 면적을 키우거나 지목·용도지역을 줄여서 다시 해 보세요.",
      },
    };
    return Response.json(body, { status: 400 });
  }
  if (error instanceof DbError) {
    const body: ApiError = { error: { code: "DB_UNAVAILABLE", message: "데이터를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요." } };
    return Response.json(body, { status: 503 });
  }
  return null;
}
