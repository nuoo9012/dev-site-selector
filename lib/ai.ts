// OpenAI 연결 (PLAN 작업 13)
// Design Ref: §9.3 — 말로 입력한 조건 문장을 정해진 모양(zod)으로 바꿔 받는다.
// 키(OPENAI_API_KEY)는 서버 환경 변수에서만 읽고, 코드·화면·기록 어디에도 쓰지 않는다 (CLAUDE.md 비밀 정보 규칙).
// 서버 쪽 코드(API)에서만 쓴다. 브라우저 코드가 이 파일을 가져오면 빌드가 멈춘다.

import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ReasoningEffort } from "openai/resources/shared";
import type { z } from "zod";
import type { ApiError, ApiErrorCode } from "./types";

/**
 * 사용하는 모델: 짧은 문장을 조건으로 바꾸는 단순 작업이라 작고 싼 모델을 쓴다. (2026-11-12 담당자 지정: gpt-5.4-mini; 20문장 비교 20/20)
 * 주의: 바꾼 뒤에는 `npm run eval:conditions`로 정확도를 다시 확인한다.
 */
export const AI_MODEL = "gpt-5.4-mini";

/** gpt-4 계열은 "생각 깊이(reasoning)" 설정을 받지 않아, 보내면 오류가 난다 */
export const SUPPORTS_REASONING = !/^gpt-4/.test(AI_MODEL);

/** 응답을 기다리는 최대 시간(밀리초). 이보다 오래 걸리면 포기하고 기본 조건으로 안내한다. */
const TIMEOUT_MS = 20_000;

/** 응답에 담길 수 있는 최대 글자 조각(토큰) 수. 조건 몇 줄이면 충분하다 */
const MAX_OUTPUT_TOKENS = 500;

// 화면에 보여줄 한국어 안내 (Design Ref: §7 오류 처리)
const MESSAGES: Record<"AI_UNAVAILABLE" | "AI_BAD_RESPONSE", { status: number; message: string }> = {
  AI_UNAVAILABLE: { status: 503, message: "AI 조건 입력을 지금 쓸 수 없어요. 기본 조건으로 실행할 수 있어요." },
  AI_BAD_RESPONSE: { status: 502, message: "조건을 이해하지 못했어요. 다시 입력하거나 기본 조건으로 실행해 주세요." },
};

/** AI 연결에서 생긴 오류. 화면에 보여줄 안내와 상태 번호를 함께 가진다. */
export class AiError extends Error {
  readonly code: "AI_UNAVAILABLE" | "AI_BAD_RESPONSE";

  constructor(code: "AI_UNAVAILABLE" | "AI_BAD_RESPONSE", cause?: unknown) {
    super(MESSAGES[code].message, { cause });
    this.name = "AiError";
    this.code = code;
  }

  /** API가 돌려줄 오류 응답 (Design Ref: §7 오류 응답 모양) */
  toResponse(): Response {
    const body: ApiError = { error: { code: this.code as ApiErrorCode, message: this.message } };
    return Response.json(body, { status: MESSAGES[this.code].status });
  }
}

/** 테스트에서 가짜 연결로 바꿀 수 있도록 필요한 부분만 정의한 모양 */
export type AiClient = Pick<OpenAI, "responses">;

let cachedClient: OpenAI | null = null;

/**
 * 연결을 만든다. 키가 없으면 AI_UNAVAILABLE. 키 값은 어디에도 남기지 않는다.
 * 일시적인 서버 오류에 대비해 SDK가 한 번 자동으로 다시 시도한다 (maxRetries).
 */
export function getAiClient(): AiClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[ai] OPENAI_API_KEY가 설정되어 있지 않아요 (.env 또는 Vercel 환경변수를 확인하세요)");
    throw new AiError("AI_UNAVAILABLE");
  }
  cachedClient ??= new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  return cachedClient;
}

export interface StructuredRequest<S extends z.ZodType> {
  /** 응답이 따라야 할 모양 */
  schema: S;
  /** 모양의 이름 (영문·숫자·밑줄) */
  schemaName: string;
  /** AI에게 주는 역할·규칙 */
  instructions: string;
  /** 담당자가 입력한 문장 (필지 데이터는 보내지 않는다 — PRD 7번) */
  input: string;
  /** AI가 생각하는 깊이. 낮출수록 빠르고 싸다. 정하지 않으면 모델 기본값 */
  reasoningEffort?: Exclude<ReasoningEffort, null>;
}

/**
 * 문장을 AI에게 보내 정해진 모양(zod)으로 받는다.
 * 실패는 모두 AiError로 바꿔 던진다.
 *  - AI_UNAVAILABLE: 키 없음·인증 실패·한도 초과·네트워크·서버 오류·시간 초과
 *  - AI_BAD_RESPONSE: 거절·중간에 끊김·모양이 맞지 않음
 */
export async function generateStructured<S extends z.ZodType>(
  request: StructuredRequest<S>,
  client: AiClient = getAiClient(),
): Promise<z.infer<S>> {
  let response;
  try {
    response = await client.responses.parse({
      model: AI_MODEL,
      instructions: request.instructions,
      input: request.input,
      text: { format: zodTextFormat(request.schema, request.schemaName) },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      ...(request.reasoningEffort && SUPPORTS_REASONING ? { reasoning: { effort: request.reasoningEffort } } : {}),
      // 입력 문장을 OpenAI 쪽에 저장하지 않는다
      store: false,
    });
  } catch (error) {
    // 키 값이 들어 있을 수 있는 원문 메시지는 기록하지 않고, 종류와 상태 번호만 남긴다
    if (error instanceof OpenAI.APIError) {
      console.error(`[ai] OpenAI 호출 실패: ${error.name} status=${error.status ?? "-"} code=${error.code ?? "-"}`);
      return fail("AI_UNAVAILABLE", error);
    }
    console.error(`[ai] 응답을 읽지 못했어요: ${error instanceof Error ? error.name : "알 수 없는 오류"}`);
    return fail("AI_BAD_RESPONSE", error);
  }

  // 중간에 끊긴 응답은 모양이 불완전할 수 있다
  if (response.status === "incomplete") {
    console.error(`[ai] 응답이 끊겼어요: ${response.incomplete_details?.reason ?? "-"}`);
    return fail("AI_BAD_RESPONSE");
  }
  // 거절 응답은 정해진 모양을 따르지 않는다
  for (const output of response.output) {
    if (output.type !== "message") continue;
    if (output.content.some((item) => item.type === "refusal")) {
      console.error("[ai] 모델이 요청을 거절했어요");
      return fail("AI_BAD_RESPONSE");
    }
  }
  if (response.output_parsed == null) {
    console.error("[ai] 응답에서 결과를 찾지 못했어요");
    return fail("AI_BAD_RESPONSE");
  }
  return response.output_parsed as z.infer<S>;
}

function fail(code: "AI_UNAVAILABLE" | "AI_BAD_RESPONSE", cause?: unknown): never {
  throw new AiError(code, cause);
}
