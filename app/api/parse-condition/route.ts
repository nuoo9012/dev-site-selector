// POST /api/parse-condition — 말로 입력한 문장을 선별 조건으로 바꿔 준다 (PLAN 작업 14)
// Design Ref: §3.3, §5.1, §7 — 문장만 AI로 보내고(필지 데이터는 보내지 않음), 결과는 화면에서 담당자가 확인한 뒤에만 실행한다.
// 이 주소는 선별을 실행하지 않는다. 조건으로 바꾸기만 한다.

import { AiError } from "@/lib/ai";
import { parseConditionText, validateText } from "@/lib/parse-condition";
import { MAX_TEXT_LENGTH, type ApiError } from "@/lib/types";

// 문장이 비었거나 200자를 넘을 때 (Design Ref: §7 TEXT_TOO_LONG). AI를 부르지 않으므로 비용이 들지 않는다.
function badText(): Response {
  const body: ApiError = { error: { code: "TEXT_TOO_LONG", message: `1~${MAX_TEXT_LENGTH}자로 입력해 주세요.` } };
  return Response.json(body, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return badText();
  }

  // 문장 검사를 통과해야만 AI를 부른다 (비용 보호)
  const checked = validateText((input as { text?: unknown } | null)?.text);
  if (!checked.ok) return badText();

  try {
    return Response.json(await parseConditionText(checked.text));
  } catch (error) {
    if (error instanceof AiError) return error.toResponse();
    // 예상하지 못한 오류는 원인 종류만 기록하고, 사용자에게는 AI 응답 오류로 안내한다
    console.error(`[parse-condition] 예상하지 못한 오류: ${error instanceof Error ? error.name : "알 수 없음"}`);
    return new AiError("AI_BAD_RESPONSE").toResponse();
  }
}
