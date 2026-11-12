// 선별 계산 자동 검사 (PLAN 작업 8)
// Design Ref: §10.2 — 계산 검사 항목. 실행: npm test

import { describe, expect, it } from "vitest";
import { DEFAULT_CONDITIONS } from "./conditions";
import { buildReason, compareParcels, judgeParcel, selectParcels } from "./selection";
import type { Conditions, Parcel } from "./types";

// 필요한 값만 바꿔 쓰는 가짜 필지 만들기 (기본값: 조건에 모두 맞는 필지)
let seq = 0;
function parcel(overrides: Partial<Parcel> = {}): Parcel {
  seq += 1;
  return {
    // 19자리 고유번호는 일반 숫자로 더하면 자릿수가 넘쳐 같은 값이 되므로 글자로 만든다
    pnu: `11560101001${String(seq).padStart(8, "0")}`,
    sigungu: "영등포구",
    address: "서울특별시 영등포구 테스트동",
    jibun: String(seq),
    landCategory: "대",
    area: 1500,
    zone1: "준주거지역",
    zone2: null,
    ...overrides,
  };
}

describe("judgeParcel — 필지 하나 판정 (DESIGN 10.2)", () => {
  it("1) 면적 1,000 · 대 · 준주거 → 후보 (경계값 포함)", () => {
    expect(judgeParcel(parcel({ area: 1000 }), DEFAULT_CONDITIONS)).toEqual({ result: "match" });
  });

  it("2) 면적 999 · 대 · 준주거 → 제외", () => {
    expect(judgeParcel(parcel({ area: 999 }), DEFAULT_CONDITIONS).result).toBe("exclude");
  });

  it("3) 면적 2,000 · 전 · 준주거 → 제외 (지목 불일치)", () => {
    expect(judgeParcel(parcel({ area: 2000, landCategory: "전" }), DEFAULT_CONDITIONS).result).toBe("exclude");
  });

  it("4) 면적 2,000 · 대 · 제2종일반주거 → 제외 (용도지역 불일치)", () => {
    expect(judgeParcel(parcel({ area: 2000, zone1: "제2종일반주거지역" }), DEFAULT_CONDITIONS).result).toBe("exclude");
  });

  it("5) 면적이 비어 있고 나머지는 맞음 → 확인 필요 (빈 항목: 면적)", () => {
    expect(judgeParcel(parcel({ area: null }), DEFAULT_CONDITIONS)).toEqual({ result: "unknown", missing: ["면적"] });
  });

  it("5-1) 면적이 비어 있어도 지목이 이미 안 맞으면 제외", () => {
    expect(judgeParcel(parcel({ area: null, landCategory: "전" }), DEFAULT_CONDITIONS).result).toBe("exclude");
  });

  it("5-2) 면적이 비어 있어도 용도지역이 이미 안 맞으면 제외", () => {
    expect(judgeParcel(parcel({ area: null, zone1: "자연녹지지역" }), DEFAULT_CONDITIONS).result).toBe("exclude");
  });

  it("5-3) 값이 여러 개 비면 빈 항목을 모두 알려줌", () => {
    const j = judgeParcel(parcel({ landCategory: null, area: null, zone1: null }), DEFAULT_CONDITIONS);
    expect(j).toEqual({ result: "unknown", missing: ["지목", "면적", "용도지역"] });
  });

  it("6) 주된 용도지역이 안 맞으면 두 번째 용도지역이 맞아도 제외 (주된 용도지역 기준)", () => {
    const p = parcel({ zone1: "제2종일반주거지역", zone2: "준주거지역" });
    expect(judgeParcel(p, DEFAULT_CONDITIONS).result).toBe("exclude");
  });

  it("6-1) 주된 용도지역이 맞으면 후보, 두 번째 용도지역은 판정에 영향 없음", () => {
    expect(judgeParcel(parcel({ zone2: "자연녹지지역" }), DEFAULT_CONDITIONS).result).toBe("match");
  });

  it("기본 조건의 용도지역 3종이 모두 후보로 인정됨", () => {
    for (const zone1 of ["일반상업지역", "준주거지역", "제3종일반주거지역"]) {
      expect(judgeParcel(parcel({ zone1 }), DEFAULT_CONDITIONS).result).toBe("match");
    }
  });

  it("조건을 바꾸면 판정도 바뀜 (면적 2,000 이상)", () => {
    const strict: Conditions = { ...DEFAULT_CONDITIONS, minArea: 2000 };
    expect(judgeParcel(parcel({ area: 1500 }), strict).result).toBe("exclude");
    expect(judgeParcel(parcel({ area: 2000 }), strict).result).toBe("match");
  });
});

describe("buildReason — 선별 근거 1줄", () => {
  it("면적·지목·용도지역을 한 줄로 보여줌", () => {
    expect(buildReason(parcel({ area: 1523 }), DEFAULT_CONDITIONS)).toBe("면적 1,523㎡(≥1,000) · 지목 대 · 준주거지역");
  });

  it("소수 면적은 소수점까지 표시", () => {
    expect(buildReason(parcel({ area: 101247.3 }), DEFAULT_CONDITIONS)).toContain("면적 101,247.3㎡");
  });

  it("두 번째 용도지역이 있으면 '일부 … 걸침'을 덧붙임", () => {
    const reason = buildReason(parcel({ zone2: "일반상업지역" }), DEFAULT_CONDITIONS);
    expect(reason).toBe("면적 1,500㎡(≥1,000) · 지목 대 · 준주거지역 (일부 일반상업지역 걸침)");
  });

  it("기준 면적은 적용한 조건 값을 따라감", () => {
    expect(buildReason(parcel(), { ...DEFAULT_CONDITIONS, minArea: 2500 })).toContain("(≥2,500)");
  });
});

describe("selectParcels — 후보와 확인 필요 나누기", () => {
  const list = [
    parcel({ area: 500 }), // 제외
    parcel({ area: 3000 }), // 후보 (큰 것)
    parcel({ area: 1200 }), // 후보
    parcel({ area: null }), // 확인 필요
    parcel({ landCategory: "도로" }), // 제외
    parcel({ landCategory: null, area: null, zone1: null }), // 확인 필요 (3개 모두 빔)
  ];
  const result = selectParcels(list, DEFAULT_CONDITIONS);

  it("후보·확인 필요 개수가 맞고 제외된 필지는 담기지 않음", () => {
    expect(result.candidates).toHaveLength(2);
    expect(result.needsCheck).toHaveLength(2);
  });

  it("후보는 면적이 큰 순서로 정렬됨", () => {
    expect(result.candidates.map((c) => c.area)).toEqual([3000, 1200]);
  });

  it("후보 100%에 근거가 붙음 (SC-2)", () => {
    expect(result.candidates.every((c) => c.reason.length > 0)).toBe(true);
  });

  it("확인 필요에는 비어 있는 항목이 기록됨", () => {
    expect(result.needsCheck.map((n) => n.missing)).toEqual(expect.arrayContaining([["면적"], ["지목", "면적", "용도지역"]]));
  });

  it("후보와 확인 필요가 겹치지 않음", () => {
    const candidateIds = new Set(result.candidates.map((c) => c.pnu));
    expect(result.needsCheck.some((n) => candidateIds.has(n.parcel.pnu))).toBe(false);
  });

  it("면적이 같으면 고유번호 순서로 정렬됨", () => {
    const a = parcel({ area: 2000 });
    const b = parcel({ area: 2000 });
    expect(compareParcels(a, b)).toBeLessThan(0);
    const sorted = selectParcels([b, a], DEFAULT_CONDITIONS).candidates;
    expect(sorted.map((c) => c.pnu)).toEqual([a.pnu, b.pnu]);
  });

  it("7) 같은 조건으로 두 번 실행해도 결과가 완전히 같음 (입력 순서가 달라도)", () => {
    const first = selectParcels(list, DEFAULT_CONDITIONS);
    const again = selectParcels([...list].reverse(), DEFAULT_CONDITIONS);
    expect(again).toEqual(first);
  });

  it("조건에 맞는 필지가 없으면 후보가 0건", () => {
    expect(selectParcels(list, { ...DEFAULT_CONDITIONS, minArea: 999999 }).candidates).toHaveLength(0);
  });

  it("빈 목록이면 둘 다 0건", () => {
    expect(selectParcels([], DEFAULT_CONDITIONS)).toEqual({ candidates: [], needsCheck: [] });
  });
});

describe("소유구분 조건 (서울 확장 후 추가)", () => {
  const stateOnly: Conditions = { ...DEFAULT_CONDITIONS, owners: ["국유지"] };

  it("소유구분 조건이 없으면 소유구분은 보지 않음 (소유정보가 없어도 후보)", () => {
    expect(judgeParcel(parcel({ owners: null }), DEFAULT_CONDITIONS)).toEqual({ result: "match" });
    expect(judgeParcel(parcel({ owners: ["개인"] }), DEFAULT_CONDITIONS)).toEqual({ result: "match" });
  });

  it("국유지 조건: 국유지는 후보, 개인 소유는 제외", () => {
    expect(judgeParcel(parcel({ owners: ["국유지"] }), stateOnly)).toEqual({ result: "match" });
    expect(judgeParcel(parcel({ owners: ["개인"] }), stateOnly).result).toBe("exclude");
  });

  it("공유 지분: 소유구분 중 하나라도 국유지면 후보", () => {
    expect(judgeParcel(parcel({ owners: ["국유지", "개인"] }), stateOnly)).toEqual({ result: "match" });
  });

  it("국공유지 묶음 조건: 시·도유지·군유지도 해당", () => {
    const wide: Conditions = { ...DEFAULT_CONDITIONS, owners: ["국유지", "시·도유지", "군유지"] };
    expect(judgeParcel(parcel({ owners: ["시·도유지"] }), wide).result).toBe("match");
    expect(judgeParcel(parcel({ owners: ["법인"] }), wide).result).toBe("exclude");
  });

  it("소유정보가 없는 필지는 추측하지 않고 확인 필요(소유구분)", () => {
    expect(judgeParcel(parcel({ owners: null }), stateOnly)).toEqual({ result: "unknown", missing: ["소유구분"] });
    expect(judgeParcel(parcel(), stateOnly)).toEqual({ result: "unknown", missing: ["소유구분"] }); // owners 값 자체가 없는 경우
  });

  it("다른 값이 안 맞으면 소유정보가 비어 있어도 제외가 먼저 (판정 순서 유지)", () => {
    expect(judgeParcel(parcel({ owners: null, area: 500 }), stateOnly).result).toBe("exclude");
  });

  it("소유구분이 안 맞으면 빈 다른 값이 있어도 제외", () => {
    expect(judgeParcel(parcel({ owners: ["개인"], area: null }), stateOnly).result).toBe("exclude");
  });

  it("선별 근거에 소유구분이 적힘 (조건으로 걸었을 때만, 국가기관 포함)", () => {
    const p = parcel({ owners: ["국유지"], ownerAgency: "중앙부처" });
    expect(buildReason(p, stateOnly)).toBe("면적 1,500㎡(≥1,000) · 지목 대 · 준주거지역 · 소유 국유지(중앙부처)");
    expect(buildReason(p, DEFAULT_CONDITIONS)).toBe("면적 1,500㎡(≥1,000) · 지목 대 · 준주거지역");
  });

  it("selectParcels: 후보·확인 필요가 소유구분 조건에 맞게 나뉨", () => {
    const r = selectParcels([parcel({ owners: ["국유지"] }), parcel({ owners: ["개인"] }), parcel({ owners: null })], stateOnly);
    expect(r.candidates).toHaveLength(1);
    expect(r.needsCheck.map((n) => n.missing)).toEqual([["소유구분"]]);
  });
});

describe("지역(구) 조건 (서울 확장 후 추가)", () => {
  const gangnam: Conditions = { ...DEFAULT_CONDITIONS, districts: ["강남구", "서초구"] };

  it("지역 조건이 없으면 어느 구든 상관없음", () => {
    expect(judgeParcel(parcel({ sigungu: "도봉구" }), DEFAULT_CONDITIONS)).toEqual({ result: "match" });
  });

  it("고른 구의 필지는 후보, 다른 구는 제외", () => {
    expect(judgeParcel(parcel({ sigungu: "강남구" }), gangnam)).toEqual({ result: "match" });
    expect(judgeParcel(parcel({ sigungu: "서초구" }), gangnam)).toEqual({ result: "match" });
    expect(judgeParcel(parcel({ sigungu: "도봉구" }), gangnam).result).toBe("exclude");
  });

  it("다른 구의 필지는 값이 비어 있어도 확인 필요가 아니라 제외", () => {
    expect(judgeParcel(parcel({ sigungu: "도봉구", area: null }), gangnam).result).toBe("exclude");
  });

  it("지역·소유구분을 함께 걸면 둘 다 맞아야 후보", () => {
    const both: Conditions = { ...gangnam, owners: ["국유지"] };
    expect(judgeParcel(parcel({ sigungu: "강남구", owners: ["국유지"] }), both)).toEqual({ result: "match" });
    expect(judgeParcel(parcel({ sigungu: "강남구", owners: ["개인"] }), both).result).toBe("exclude");
    expect(judgeParcel(parcel({ sigungu: "도봉구", owners: ["국유지"] }), both).result).toBe("exclude");
  });
});

describe("땅모양 제외 조건 (지형형상 추가 후)", () => {
  const noIrregular: Conditions = { ...DEFAULT_CONDITIONS, excludeShapes: ["부정형"] };

  it("땅모양 조건이 없으면 어떤 모양이든(모양을 몰라도) 후보", () => {
    expect(judgeParcel(parcel({ landShape: "부정형" }), DEFAULT_CONDITIONS)).toEqual({ result: "match" });
    expect(judgeParcel(parcel({ landShape: null }), DEFAULT_CONDITIONS)).toEqual({ result: "match" });
  });

  it("부정형 제외: 부정형은 제외, 다른 모양은 후보", () => {
    expect(judgeParcel(parcel({ landShape: "부정형" }), noIrregular).result).toBe("exclude");
    expect(judgeParcel(parcel({ landShape: "정방형" }), noIrregular)).toEqual({ result: "match" });
    expect(judgeParcel(parcel({ landShape: "사다리형" }), noIrregular)).toEqual({ result: "match" });
  });

  it("여러 모양 제외", () => {
    const c: Conditions = { ...DEFAULT_CONDITIONS, excludeShapes: ["부정형", "자루형"] };
    expect(judgeParcel(parcel({ landShape: "자루형" }), c).result).toBe("exclude");
    expect(judgeParcel(parcel({ landShape: "가로장방" }), c)).toEqual({ result: "match" });
  });

  it("모양을 모르는 필지(null·값 없음)는 추측하지 않고 확인 필요(지형형상)", () => {
    expect(judgeParcel(parcel({ landShape: null }), noIrregular)).toEqual({ result: "unknown", missing: ["지형형상"] });
    expect(judgeParcel(parcel(), noIrregular)).toEqual({ result: "unknown", missing: ["지형형상"] });
  });

  it("다른 조건이 안 맞으면 모양을 몰라도 제외가 먼저", () => {
    expect(judgeParcel(parcel({ landShape: null, area: 500 }), noIrregular).result).toBe("exclude");
  });

  it("땅모양·소유구분이 모두 비어 있으면 둘 다 확인 필요에 적힘", () => {
    const c: Conditions = { ...noIrregular, owners: ["국유지"] };
    expect(judgeParcel(parcel({ landShape: null, owners: null }), c)).toEqual({ result: "unknown", missing: ["소유구분", "지형형상"] });
  });
});

describe("면적 범위 조건 (최대 면적 추가 후)", () => {
  const range: Conditions = { ...DEFAULT_CONDITIONS, minArea: 1500, maxArea: 3000 };

  it("최대 면적이 없으면 상한 없음", () => {
    expect(judgeParcel(parcel({ area: 9_999_999 }), DEFAULT_CONDITIONS)).toEqual({ result: "match" });
  });

  it("범위 안(경계 포함)은 후보, 최소 미만·최대 초과는 제외", () => {
    expect(judgeParcel(parcel({ area: 1500 }), range)).toEqual({ result: "match" });
    expect(judgeParcel(parcel({ area: 3000 }), range)).toEqual({ result: "match" });
    expect(judgeParcel(parcel({ area: 2200 }), range)).toEqual({ result: "match" });
    expect(judgeParcel(parcel({ area: 1499.9 }), range).result).toBe("exclude");
    expect(judgeParcel(parcel({ area: 3000.1 }), range).result).toBe("exclude");
  });

  it("면적을 모르는 필지는 추측하지 않고 확인 필요(면적)", () => {
    expect(judgeParcel(parcel({ area: null }), range)).toEqual({ result: "unknown", missing: ["면적"] });
  });

  it("선별 근거에 범위가 적힘 (최대가 없으면 기존 문구 그대로)", () => {
    expect(buildReason(parcel({ area: 2000 }), range)).toBe("면적 2,000㎡(1,500~3,000) · 지목 대 · 준주거지역");
    expect(buildReason(parcel({ area: 2000 }), DEFAULT_CONDITIONS)).toBe("면적 2,000㎡(≥1,000) · 지목 대 · 준주거지역");
  });
});
