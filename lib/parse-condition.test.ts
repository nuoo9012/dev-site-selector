// 문장 → 조건 변환 규칙 자동 검사 (PLAN 작업 14) — 실제 AI를 부르지 않고 정해진 AI 결과로 확인한다
// PRD must ① 규칙 3·4·5·10, Design Ref: §5.1. 실행: npm test

import { describe, expect, it, vi } from "vitest";
import { SUPPORTS_REASONING, type AiClient } from "./ai";
import { DEFAULT_CONDITIONS } from "./conditions";
import { aiResultSchema, interpretAiResult, parseConditionText, summarize, validateText, type AiResult } from "./parse-condition";
import { MAX_TEXT_LENGTH } from "./types";

// 값만 바꿔 쓰는 AI 결과 (기본: 아무것도 말하지 않은 ok)
function ai(overrides: Partial<AiResult> = {}): AiResult {
  return { status: "ok", minArea: null, maxArea: null, landCategories: null, zones: null, owners: null, districts: null, excludeShapes: null, message: "", ...overrides };
}

describe("validateText — 1~200자 검사", () => {
  it("보통 문장은 통과하고 앞뒤 공백은 지움", () => {
    expect(validateText("  면적 2천㎡ 이상  ")).toEqual({ ok: true, text: "면적 2천㎡ 이상" });
  });

  it("200자는 통과, 201자는 거절 (경계값)", () => {
    expect(validateText("가".repeat(MAX_TEXT_LENGTH)).ok).toBe(true);
    expect(validateText("가".repeat(MAX_TEXT_LENGTH + 1)).ok).toBe(false);
  });

  it("공백뿐이거나 비어 있으면 거절", () => {
    for (const input of ["", "   ", "\n\t"]) expect(validateText(input).ok).toBe(false);
  });

  it("문자열이 아니면 거절", () => {
    for (const input of [undefined, null, 42, {}, ["a"]]) expect(validateText(input).ok).toBe(false);
  });

  it("이모지처럼 두 칸을 차지하는 글자도 한 글자로 셈", () => {
    expect(validateText("😀".repeat(MAX_TEXT_LENGTH)).ok).toBe(true);
    expect(validateText("😀".repeat(MAX_TEXT_LENGTH + 1)).ok).toBe(false);
  });
});

describe("interpretAiResult — 말하지 않은 항목은 기본값 (규칙 10)", () => {
  it("면적·용도지역만 말하면 지목은 기본값, 안내에 '(기본값)' 표시", () => {
    const r = interpretAiResult(ai({ minArea: 2000, zones: ["준주거지역"] }));
    expect(r).toEqual({
      status: "ok",
      conditions: { minArea: 2000, landCategories: ["대"], zones: ["준주거지역"] },
      defaulted: ["landCategories"],
      message: "면적 2,000㎡ 이상, 지목 대(기본값), 용도지역 준주거지역으로 바꿨어요.",
    });
  });

  it("세 가지를 모두 말하면 기본값 표시가 없음", () => {
    const r = interpretAiResult(ai({ minArea: 500, landCategories: ["대", "공장용지"], zones: ["일반상업지역", "준주거지역"] }));
    expect(r).toMatchObject({ status: "ok", defaulted: [] });
    expect(r.message).toBe("면적 500㎡ 이상, 지목 대·공장용지, 용도지역 일반상업지역·준주거지역으로 바꿨어요.");
  });

  it("면적만 말하면 지목·용도지역은 기본값", () => {
    const r = interpretAiResult(ai({ minArea: 3000 }));
    expect(r).toMatchObject({ status: "ok", defaulted: ["landCategories", "zones"], conditions: { ...DEFAULT_CONDITIONS, minArea: 3000 } });
  });

  it("빈 목록은 말하지 않은 것으로 보고 기본값", () => {
    const r = interpretAiResult(ai({ minArea: 1500, landCategories: [], zones: [] }));
    expect(r).toMatchObject({ status: "ok", defaulted: ["landCategories", "zones"] });
  });

  it("면적 0은 '말한 값'으로 인정 (기본값으로 바뀌지 않음)", () => {
    const r = interpretAiResult(ai({ minArea: 0 }));
    expect(r).toMatchObject({ status: "ok", conditions: { minArea: 0 }, defaulted: ["landCategories", "zones"] });
  });

  it("중복된 값은 합침", () => {
    const r = interpretAiResult(ai({ zones: ["준주거지역", "준주거지역"] }));
    expect(r).toMatchObject({ conditions: { zones: ["준주거지역"] } });
  });
});

describe("interpretAiResult — 아무것도 못 알아냈을 때 (규칙 4·5)", () => {
  it("ok인데 모두 null이면 기본 조건을 몰래 실행하지 않고 되물음", () => {
    const r = interpretAiResult(ai());
    expect(r.status).toBe("need_clarification");
    expect(r).not.toHaveProperty("conditions");
    expect(r.message).toContain("조건을 찾지 못했어요");
  });
});

describe("interpretAiResult — 되묻기·지원 안 함 (규칙 3·4)", () => {
  it("애매한 표현은 AI의 되묻는 질문을 그대로 보여주고 조건은 없음", () => {
    const r = interpretAiResult(ai({ status: "need_clarification", message: "  몇 ㎡ 이상을 넓은 땅으로 볼까요? 숫자로 알려 주세요.  " }));
    expect(r).toEqual({ status: "need_clarification", message: "몇 ㎡ 이상을 넓은 땅으로 볼까요? 숫자로 알려 주세요." });
  });

  it("지원하지 않는 조건은 안내만 하고 조건은 없음 — 같이 말한 면적 등을 몰래 실행하지 않음", () => {
    const r = interpretAiResult(ai({ status: "unsupported", minArea: 1000, message: "지원하지 않는 조건: 소유자. 면적·지목·용도지역만 쓸 수 있어요." }));
    expect(r).toEqual({ status: "unsupported", message: "지원하지 않는 조건: 소유자. 면적·지목·용도지역만 쓸 수 있어요." });
    expect(r).not.toHaveProperty("conditions");
  });

  it("AI가 안내를 비워 보내도 기본 안내가 나옴", () => {
    expect(interpretAiResult(ai({ status: "unsupported", message: "  " })).message).toContain("지원하지 않는 조건");
    expect(interpretAiResult(ai({ status: "need_clarification", message: "" })).message).toContain("다시 적어 주세요");
  });
});

describe("interpretAiResult — AI가 준 값도 서버 검사를 다시 통과해야 함", () => {
  it("음수 면적은 실행하지 않고 되물음", () => {
    const r = interpretAiResult(ai({ minArea: -5 }));
    expect(r).toEqual({ status: "need_clarification", message: "최소 면적은 0 이상이어야 해요." });
  });

  it("너무 큰 면적도 되물음", () => {
    expect(interpretAiResult(ai({ minArea: 1e12 })).status).toBe("need_clarification");
  });
});

describe("summarize — 안내 한 줄", () => {
  it("기본값을 쓴 항목에만 '(기본값)'이 붙음", () => {
    expect(summarize(DEFAULT_CONDITIONS, ["minArea", "landCategories", "zones"])).toBe(
      "면적 1,000㎡ 이상(기본값), 지목 대(기본값), 용도지역 일반상업지역·준주거지역·제3종일반주거지역(기본값)으로 바꿨어요.",
    );
    expect(summarize(DEFAULT_CONDITIONS, [])).not.toContain("기본값");
  });
});

describe("aiResultSchema — AI가 돌려줄 수 있는 모양", () => {
  it("허용 목록 안의 지목·용도지역만 받아들임", () => {
    expect(aiResultSchema.safeParse(ai({ landCategories: ["대"], zones: ["준주거지역"] })).success).toBe(true);
    expect(aiResultSchema.safeParse({ ...ai(), zones: ["준주거"] }).success).toBe(false); // 줄임말은 안 됨
    expect(aiResultSchema.safeParse({ ...ai(), landCategories: ["대지"] }).success).toBe(false);
    expect(aiResultSchema.safeParse({ ...ai(), status: "maybe" }).success).toBe(false);
  });
});

describe("parseConditionText — AI 호출 방식", () => {
  it("문장만 보내고, 낮은 생각 깊이·정해진 모양으로 부른 뒤 결과를 변환함", async () => {
    const parse = vi.fn<(request: unknown) => Promise<unknown>>(async () => ({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text" }] }],
      output_parsed: ai({ minArea: 2000, zones: ["준주거지역"] }),
    }));
    const client = { responses: { parse } } as unknown as AiClient;

    const r = await parseConditionText("면적 2천㎡ 이상 준주거만", client);
    expect(r.status).toBe("ok");

    const args = parse.mock.calls[0][0] as Record<string, unknown>;
    expect(args.input).toBe("면적 2천㎡ 이상 준주거만"); // 문장 그대로, 필지 데이터 없음
    expect(args.reasoning).toEqual(SUPPORTS_REASONING ? { effort: "low" } : undefined);
    expect(args.store).toBe(false);
    expect(String(args.instructions)).toContain("minArea");
  });
});

describe("interpretAiResult — 소유구분 (서울 확장 후 추가)", () => {
  it("'국유지만'은 소유구분만 말한 것이라 나머지는 기본값으로 채우고, 소유구분은 기본값 표시 없이 안내에 들어감", () => {
    const r = interpretAiResult(ai({ owners: ["국유지"] }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.conditions).toEqual({ ...DEFAULT_CONDITIONS, owners: ["국유지"] });
    expect(r.defaulted).toEqual(["minArea", "landCategories", "zones"]);
    expect(r.message).toContain("소유구분 국유지");
  });

  it("소유구분을 말하지 않으면 conditions에 owners가 없음", () => {
    const r = interpretAiResult(ai({ minArea: 2000 }));
    expect(r.status === "ok" && "owners" in r.conditions).toBe(false);
  });

  it("아무것도 말하지 않았으면(소유구분 포함) 여전히 되묻는다", () => {
    expect(interpretAiResult(ai({ owners: [] })).status).toBe("need_clarification");
  });
});

describe("interpretAiResult — 지역(구) (서울 확장 후 추가)", () => {
  it("'강남이랑 서초'처럼 지역만 말해도 조건이 되고, 나머지는 기본값, 안내에 지역이 들어감", () => {
    const r = interpretAiResult(ai({ districts: ["강남구", "서초구"] }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.conditions).toEqual({ ...DEFAULT_CONDITIONS, districts: ["강남구", "서초구"] });
    expect(r.defaulted).toEqual(["minArea", "landCategories", "zones"]);
    expect(r.message).toContain("지역 강남구·서초구");
  });

  it("지역을 말하지 않으면 conditions에 districts가 없음", () => {
    const r = interpretAiResult(ai({ minArea: 2000 }));
    expect(r.status === "ok" && "districts" in r.conditions).toBe(false);
  });
});

describe("interpretAiResult — 땅모양 제외 (지형형상 추가 후)", () => {
  it("'부정형 빼고'처럼 땅모양만 말해도 조건이 되고, 안내에 땅모양 제외가 들어감", () => {
    const r = interpretAiResult(ai({ excludeShapes: ["부정형"] }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.conditions).toEqual({ ...DEFAULT_CONDITIONS, excludeShapes: ["부정형"] });
    expect(r.defaulted).toEqual(["minArea", "landCategories", "zones"]);
    expect(r.message).toContain("땅모양 부정형 제외");
  });

  it("땅모양을 말하지 않으면 conditions에 excludeShapes가 없음", () => {
    const r = interpretAiResult(ai({ minArea: 2000 }));
    expect(r.status === "ok" && "excludeShapes" in r.conditions).toBe(false);
  });
});

describe("interpretAiResult — 최대 면적 (면적 범위 추가 후)", () => {
  it("'5천㎡ 이하'처럼 상한만 말해도 조건이 되고, 최소 면적은 기본값, 안내에 범위가 들어감", () => {
    const r = interpretAiResult(ai({ maxArea: 5000 }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.conditions).toEqual({ ...DEFAULT_CONDITIONS, maxArea: 5000 });
    expect(r.defaulted).toEqual(["minArea", "landCategories", "zones"]);
    expect(r.message).toContain("면적 1,000㎡ 이상 ~ 5,000㎡ 이하(기본값)");
  });

  it("하한과 상한을 함께 말하면 둘 다 반영", () => {
    const r = interpretAiResult(ai({ minArea: 1500, maxArea: 3000 }));
    expect(r.status === "ok" && r.conditions.minArea === 1500 && r.conditions.maxArea === 3000).toBe(true);
  });

  it("최대가 최소보다 작은 말은 그대로 실행하지 않고 다시 적게 한다", () => {
    const r = interpretAiResult(ai({ minArea: 3000, maxArea: 1000 }));
    expect(r).toEqual({ status: "need_clarification", message: "최대 면적은 최소 면적보다 작을 수 없어요." });
  });

  it("최대 면적을 말하지 않으면 conditions에 maxArea가 없음", () => {
    const r = interpretAiResult(ai({ minArea: 2000 }));
    expect(r.status === "ok" && "maxArea" in r.conditions).toBe(false);
  });
});
