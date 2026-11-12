// /api/parse-condition 자동 검사 (PLAN 작업 14) — AI는 가짜로 바꿔서 서버 없이 직접 요청을 넣어 본다
// Design Ref: §10.3 API 검사 #3~#6. 핵심: 잘못된 문장은 AI를 부르지 않는다(비용 보호).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiError, generateStructured } from "@/lib/ai";
import { MAX_TEXT_LENGTH } from "@/lib/types";
import { POST } from "./route";

// 실제 OpenAI 대신 가짜 generateStructured를 쓴다 (AiError 등 나머지는 그대로)
vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  generateStructured: vi.fn(),
}));
const fakeAi = vi.mocked(generateStructured);

function post(body: unknown, raw = false): Promise<Response> {
  return POST(
    new Request("http://localhost/api/parse-condition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );
}

const noneSaid = { status: "ok", minArea: null, landCategories: null, zones: null, owners: null, districts: null, excludeShapes: null, message: "" } as const;

beforeEach(() => {
  fakeAi.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/parse-condition — 문장 검사 (AI를 부르지 않음)", () => {
  it.each([
    ["빈 문장", { text: "" }],
    ["공백뿐", { text: "   " }],
    ["201자", { text: "가".repeat(MAX_TEXT_LENGTH + 1) }],
    ["text 없음", {}],
    ["숫자", { text: 123 }],
    ["null 본문", null],
  ])("%s → 400 TEXT_TOO_LONG, AI 호출 0번", async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "TEXT_TOO_LONG", message: "1~200자로 입력해 주세요." } });
    expect(fakeAi).not.toHaveBeenCalled();
  });

  it("JSON이 아닌 요청도 400이고 AI를 부르지 않음", async () => {
    const res = await post("hello", true);
    expect(res.status).toBe(400);
    expect(fakeAi).not.toHaveBeenCalled();
  });
});

describe("POST /api/parse-condition — 정상 흐름", () => {
  it("문장 → 조건 (말하지 않은 지목은 기본값)", async () => {
    fakeAi.mockResolvedValue({ ...noneSaid, minArea: 2000, zones: ["준주거지역"] });
    const res = await post({ text: "면적 2천㎡ 이상 준주거만" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      conditions: { minArea: 2000, landCategories: ["대"], zones: ["준주거지역"] },
      defaulted: ["landCategories"],
      message: "면적 2,000㎡ 이상, 지목 대(기본값), 용도지역 준주거지역으로 바꿨어요.",
    });
    expect(fakeAi).toHaveBeenCalledTimes(1);
  });

  it("200자 문장은 AI까지 전달됨 (경계값)", async () => {
    fakeAi.mockResolvedValue({ ...noneSaid, minArea: 1 });
    expect((await post({ text: "가".repeat(MAX_TEXT_LENGTH) })).status).toBe(200);
    expect(fakeAi).toHaveBeenCalledTimes(1);
  });

  it("애매한 표현 → 200, need_clarification, 조건 없음", async () => {
    fakeAi.mockResolvedValue({ ...noneSaid, status: "need_clarification", message: "몇 ㎡ 이상을 넓은 땅으로 볼까요? 숫자로 알려 주세요." });
    const body = await (await post({ text: "넓은 땅" })).json();
    expect(body).toEqual({ status: "need_clarification", message: "몇 ㎡ 이상을 넓은 땅으로 볼까요? 숫자로 알려 주세요." });
  });

  it("지원하지 않는 조건 → 200, unsupported", async () => {
    fakeAi.mockResolvedValue({ ...noneSaid, status: "unsupported", message: "지원하지 않는 조건: 소유자. 면적·지목·용도지역만 쓸 수 있어요." });
    const body = await (await post({ text: "소유자가 국가인 것" })).json();
    expect(body.status).toBe("unsupported");
    expect(body).not.toHaveProperty("conditions");
  });
});

describe("POST /api/parse-condition — AI 오류", () => {
  it("AI 연결 실패 → 503 AI_UNAVAILABLE", async () => {
    fakeAi.mockRejectedValue(new AiError("AI_UNAVAILABLE"));
    const res = await post({ text: "면적 1000 이상" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "AI_UNAVAILABLE", message: "AI 조건 입력을 지금 쓸 수 없어요. 기본 조건으로 실행할 수 있어요." } });
  });

  it("AI 응답 오류 → 502 AI_BAD_RESPONSE", async () => {
    fakeAi.mockRejectedValue(new AiError("AI_BAD_RESPONSE"));
    const res = await post({ text: "면적 1000 이상" });
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("AI_BAD_RESPONSE");
  });

  it("예상하지 못한 오류도 사용자에게는 AI_BAD_RESPONSE 안내만 보이고 원인 내용은 나가지 않음", async () => {
    fakeAi.mockRejectedValue(new Error("내부 정보 sk-secret-123"));
    const res = await post({ text: "면적 1000 이상" });
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("sk-secret");
  });
});
