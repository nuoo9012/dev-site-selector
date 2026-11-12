// OpenAI 연결 자동 검사 (PLAN 작업 13) — 실제 OpenAI를 부르지 않고 가짜 연결로 확인한다
// Design Ref: §7 오류 코드(AI_UNAVAILABLE, AI_BAD_RESPONSE), §9.3 사용 방식. 실행: npm test

import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AI_MODEL, AiError, generateStructured, getAiClient, type AiClient } from "./ai";

const schema = z.object({ minArea: z.number(), note: z.string() });
const request = { schema, schemaName: "test_conditions", instructions: "조건으로 바꿔 주세요.", input: "면적 2천 이상" };

// 가짜 연결: responses.parse가 정해 둔 값을 돌려주거나 오류를 던진다
function fakeClient(result: unknown | Error): { client: AiClient; parse: ReturnType<typeof vi.fn> } {
  const parse = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { client: { responses: { parse } } as unknown as AiClient, parse };
}

const okResponse = (parsed: unknown) => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text" }] }], output_parsed: parsed });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("generateStructured — 정상", () => {
  it("응답을 정해진 모양으로 돌려줌", async () => {
    const { client } = fakeClient(okResponse({ minArea: 2000, note: "ok" }));
    await expect(generateStructured(request, client)).resolves.toEqual({ minArea: 2000, note: "ok" });
  });

  it("작은 모델·저장 안 함·글자 수 제한·정해진 모양 요청으로 부름, 입력 문장만 보냄", async () => {
    const { client, parse } = fakeClient(okResponse({ minArea: 1, note: "" }));
    await generateStructured(request, client);
    expect(parse).toHaveBeenCalledTimes(1);
    const args = parse.mock.calls[0][0];
    expect(args).toMatchObject({
      model: AI_MODEL,
      instructions: request.instructions,
      input: request.input,
      store: false,
      max_output_tokens: 500,
    });
    expect(args.text.format).toMatchObject({ type: "json_schema", name: "test_conditions", strict: true });
    // 보내는 값은 이 몇 가지뿐 — 필지 데이터 같은 다른 정보가 섞이지 않음
    expect(Object.keys(args).sort()).toEqual(["input", "instructions", "max_output_tokens", "model", "store", "text"]);
  });
});

describe("generateStructured — 실패는 AiError로 바뀜", () => {
  it("OpenAI 쪽 오류(인증·한도·서버 오류)는 AI_UNAVAILABLE, 키가 포함된 원문은 기록·안내에 남지 않음", async () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "sk-secret-do-not-log-123";
    const apiError = new OpenAI.APIError(401, { message: `Incorrect API key provided: ${secret}` }, `401 Incorrect API key provided: ${secret}`, new Headers());
    const { client } = fakeClient(apiError);

    const error = await generateStructured(request, client).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.code).toBe("AI_UNAVAILABLE");
    expect(error.message).toBe("AI 조건 입력을 지금 쓸 수 없어요. 기본 조건으로 실행할 수 있어요.");
    // 사용자 안내와 서버 기록 어디에도 키 값이 없음
    expect(error.message).not.toContain(secret);
    expect(logs.mock.calls.flat().join(" ")).not.toContain(secret);
    expect(logs.mock.calls.flat().join(" ")).toContain("status=401");
  });

  it("연결 실패·시간 초과도 AI_UNAVAILABLE", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const err of [new OpenAI.APIConnectionError({ message: "연결 실패" }), new OpenAI.APIConnectionTimeoutError({ message: "시간 초과" })]) {
      const { client } = fakeClient(err);
      await expect(generateStructured(request, client)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    }
  });

  it("응답을 읽다가 생긴 일반 오류는 AI_BAD_RESPONSE", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient(new SyntaxError("JSON 모양이 아님"));
    await expect(generateStructured(request, client)).rejects.toMatchObject({ code: "AI_BAD_RESPONSE" });
  });

  it("중간에 끊긴 응답(incomplete)은 AI_BAD_RESPONSE", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [], output_parsed: null });
    await expect(generateStructured(request, client)).rejects.toMatchObject({ code: "AI_BAD_RESPONSE" });
  });

  it("거절 응답은 AI_BAD_RESPONSE", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "도와드릴 수 없어요" }] }], output_parsed: null });
    await expect(generateStructured(request, client)).rejects.toMatchObject({ code: "AI_BAD_RESPONSE" });
  });

  it("결과가 비어 있으면 AI_BAD_RESPONSE", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({ status: "completed", output: [], output_parsed: null });
    await expect(generateStructured(request, client)).rejects.toMatchObject({ code: "AI_BAD_RESPONSE" });
  });
});

describe("getAiClient — 키 읽기", () => {
  it("OPENAI_API_KEY가 없으면 AI_UNAVAILABLE이고 기록에 키 이름만 남음", () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => getAiClient()).toThrowError(AiError);
    expect(logs.mock.calls.flat().join(" ")).toContain("OPENAI_API_KEY");
  });

  it("키가 있으면 연결을 만든다 (네트워크 호출 없음)", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-not-real");
    expect(getAiClient().responses).toBeDefined();
  });
});

describe("AiError.toResponse — 오류 응답", () => {
  it("AI_UNAVAILABLE → 503, 정해진 오류 응답 모양", async () => {
    const res = new AiError("AI_UNAVAILABLE").toResponse();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "AI_UNAVAILABLE", message: "AI 조건 입력을 지금 쓸 수 없어요. 기본 조건으로 실행할 수 있어요." } });
  });

  it("AI_BAD_RESPONSE → 502", async () => {
    const res = new AiError("AI_BAD_RESPONSE").toResponse();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: { code: "AI_BAD_RESPONSE", message: "조건을 이해하지 못했어요. 다시 입력하거나 기본 조건으로 실행해 주세요." } });
  });
});
