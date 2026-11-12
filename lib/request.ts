// API 요청에서 조건을 읽고 검사하는 공통 부분 (PLAN 작업 12)
// /api/select 와 /api/export 가 똑같은 방식으로 조건을 받도록 한곳에 모았다. 서버 쪽 전용.

import type { ApiError, Conditions } from "./types";
import { validateConditions } from "./validate-conditions";

/** 조건 값이 올바르지 않을 때 보내는 400 응답 (Design Ref: §7 오류 코드) */
export function badRequest(message: string): Response {
  const body: ApiError = { error: { code: "INVALID_CONDITIONS", message } };
  return Response.json(body, { status: 400 });
}

export type ReadConditions = { ok: true; conditions: Conditions } | { ok: false; response: Response };

/**
 * 요청 본문(JSON)을 읽어 조건으로 검사한다.
 * 통과하면 중복을 없앤 조건을, 실패하면 그대로 돌려줄 400 응답을 돌려준다.
 */
export async function readConditions(request: Request): Promise<ReadConditions> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return { ok: false, response: badRequest("조건을 읽지 못했어요. JSON 형식으로 보내 주세요.") };
  }
  const checked = validateConditions(input);
  if (!checked.ok) return { ok: false, response: badRequest(checked.message) };
  return { ok: true, conditions: checked.conditions };
}
