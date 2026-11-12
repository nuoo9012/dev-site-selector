// 조건 값 검사 자동 검사 (PLAN 작업 9)
// Design Ref: §10.3 — API 검사 항목 중 입력 검사 부분. 실행: npm test

import { describe, expect, it } from "vitest";
import { DEFAULT_CONDITIONS } from "./conditions";
import { validateConditions } from "./validate-conditions";

describe("validateConditions — 조건 값 검사", () => {
  it("기본 조건은 그대로 통과", () => {
    expect(validateConditions(DEFAULT_CONDITIONS)).toEqual({ ok: true, conditions: DEFAULT_CONDITIONS });
  });

  it("면적 0은 허용 (경계값)", () => {
    expect(validateConditions({ ...DEFAULT_CONDITIONS, minArea: 0 }).ok).toBe(true);
  });

  it("면적이 음수면 거절하고 이유를 알려줌", () => {
    const r = validateConditions({ ...DEFAULT_CONDITIONS, minArea: -1 });
    expect(r).toEqual({ ok: false, message: "최소 면적은 0 이상이어야 해요." });
  });

  it("면적이 숫자가 아니면 거절", () => {
    expect(validateConditions({ ...DEFAULT_CONDITIONS, minArea: "1000" }).ok).toBe(false);
    expect(validateConditions({ ...DEFAULT_CONDITIONS, minArea: null }).ok).toBe(false);
    expect(validateConditions({ ...DEFAULT_CONDITIONS, minArea: Number.NaN }).ok).toBe(false);
    expect(validateConditions({ ...DEFAULT_CONDITIONS, minArea: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });

  it("너무 큰 면적은 거절", () => {
    expect(validateConditions({ ...DEFAULT_CONDITIONS, minArea: 1e12 }).ok).toBe(false);
  });

  it("목록에 없는 지목·용도지역은 거절", () => {
    const badLand = validateConditions({ ...DEFAULT_CONDITIONS, landCategories: ["대지"] });
    expect(badLand).toEqual({ ok: false, message: "지원하지 않는 지목이에요." });
    const badZone = validateConditions({ ...DEFAULT_CONDITIONS, zones: ["상업지역"] });
    expect(badZone).toEqual({ ok: false, message: "지원하지 않는 용도지역이에요." });
  });

  it("지목·용도지역이 빈 목록이면 거절", () => {
    expect(validateConditions({ ...DEFAULT_CONDITIONS, landCategories: [] }).ok).toBe(false);
    expect(validateConditions({ ...DEFAULT_CONDITIONS, zones: [] }).ok).toBe(false);
  });

  it("항목이 빠졌거나 객체가 아니면 거절하고 한국어 안내만 나옴", () => {
    for (const input of [{}, null, "조건", 42, [], { minArea: 1000 }]) {
      const r = validateConditions(input);
      expect(r.ok).toBe(false);
      // zod 기본 영어 오류 문구("Invalid input: expected …")가 그대로 나가지 않음
      if (!r.ok) expect(r.message).not.toMatch(/Invalid|expected|received|Required/i);
    }
  });

  it("중복된 지목·용도지역은 하나로 합침", () => {
    const r = validateConditions({ ...DEFAULT_CONDITIONS, landCategories: ["대", "대"], zones: ["준주거지역", "준주거지역"] });
    expect(r).toEqual({
      ok: true,
      conditions: { minArea: 1000, landCategories: ["대"], zones: ["준주거지역"] },
    });
  });

  it("모르는 항목이 섞여 있어도 조건에는 알려진 항목만 남음", () => {
    const r = validateConditions({ ...DEFAULT_CONDITIONS, owner: "국가" });
    expect(r).toEqual({ ok: true, conditions: DEFAULT_CONDITIONS });
  });
});

describe("validateConditions — 소유구분 (서울 확장 후 추가)", () => {
  it("소유구분이 없으면 이전과 같은 모양(owners 항목 없음)", () => {
    expect(validateConditions(DEFAULT_CONDITIONS)).toEqual({ ok: true, conditions: DEFAULT_CONDITIONS });
    expect(validateConditions({ ...DEFAULT_CONDITIONS, owners: [] })).toEqual({ ok: true, conditions: DEFAULT_CONDITIONS });
  });

  it("허용 목록의 소유구분은 통과하고 중복은 합침", () => {
    const r = validateConditions({ ...DEFAULT_CONDITIONS, owners: ["국유지", "국유지", "시·도유지"] });
    expect(r).toEqual({ ok: true, conditions: { ...DEFAULT_CONDITIONS, owners: ["국유지", "시·도유지"] } });
  });

  it("목록에 없는 소유구분과 숫자·문자열은 한국어 안내와 함께 거절", () => {
    expect(validateConditions({ ...DEFAULT_CONDITIONS, owners: ["홍길동"] })).toEqual({ ok: false, message: "지원하지 않는 소유구분이에요." });
    expect(validateConditions({ ...DEFAULT_CONDITIONS, owners: "국유지" })).toEqual({ ok: false, message: "소유구분은 목록으로 보내 주세요." });
  });

  it("소유구분 목록이 너무 길면 거절", () => {
    expect(validateConditions({ ...DEFAULT_CONDITIONS, owners: Array(40).fill("국유지") }).ok).toBe(false);
  });
});

describe("validateConditions — 지역(구) (서울 확장 후 추가)", () => {
  it("지역이 없거나 비어 있으면 이전과 같은 모양", () => {
    expect(validateConditions({ ...DEFAULT_CONDITIONS, districts: [] })).toEqual({ ok: true, conditions: DEFAULT_CONDITIONS });
  });

  it("서울 25개 구 이름은 통과하고 중복은 합침", () => {
    const r = validateConditions({ ...DEFAULT_CONDITIONS, districts: ["강남구", "강남구", "서초구"] });
    expect(r).toEqual({ ok: true, conditions: { ...DEFAULT_CONDITIONS, districts: ["강남구", "서초구"] } });
  });

  it("동 이름·서울 밖 지역은 한국어 안내와 함께 거절", () => {
    expect(validateConditions({ ...DEFAULT_CONDITIONS, districts: ["여의도동"] })).toEqual({
      ok: false,
      message: "지원하지 않는 지역이에요. 서울 25개 구 중에서 골라 주세요.",
    });
    expect(validateConditions({ ...DEFAULT_CONDITIONS, districts: ["수원시"] }).ok).toBe(false);
  });

  it("구 목록 25개가 앱의 구 코드표와 같음 (한쪽만 고치면 여기서 알려줌)", async () => {
    const { DISTRICTS } = await import("./conditions");
    const { SIGUNGU_BY_CODE } = await import("./types");
    expect([...DISTRICTS].sort()).toEqual(Object.values(SIGUNGU_BY_CODE).sort());
    expect(DISTRICTS).toHaveLength(25);
  });
});
