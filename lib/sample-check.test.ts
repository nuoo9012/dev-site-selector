// 표본 정확도 확인 도구 자동 검사 (PLAN 작업 16) — 가짜 필지·가짜 표본 파일로 확인한다. 실행: npm test

import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONDITIONS } from "./conditions";
import { checkSample, decodeCsv, explainExclusion, formatSampleReport, parseSampleCsv, type SampleRow } from "./sample-check";
import type { Parcel } from "./types";

function parcel(overrides: Partial<Parcel>): Parcel {
  return {
    pnu: "1156010100100010000",
    sigungu: "영등포구",
    address: "서울특별시 영등포구 여의도동",
    jibun: "50",
    landCategory: "대",
    area: 98843,
    zone1: "준주거지역",
    zone2: null,
    ...overrides,
  };
}

const parcels: Parcel[] = [
  parcel({ jibun: "50" }), // 후보
  parcel({ jibun: "51", area: 980 }), // 제외 (면적)
  parcel({ jibun: "52", landCategory: "전", zone1: "제2종일반주거지역" }), // 제외 (지목·용도지역)
  parcel({ jibun: "53", landCategory: null, area: null, zone1: null }), // 확인 필요
  parcel({ jibun: "산 12-3" }), // 후보 (산 지번)
  parcel({ jibun: "7-2", address: "서울특별시 영등포구 영등포동1가" }), // 후보 (동 이름에 1가)
  parcel({ jibun: "9", sigungu: "도봉구", address: "서울특별시 도봉구 창동" }), // 후보 (도봉구)
];

const row = (sigungu: string, dong: string, jibun: string, line = 2): SampleRow => ({ line, sigungu, dong, jibun });

describe("decodeCsv — 파일 글자 인코딩", () => {
  it("UTF-8 그대로", () => {
    expect(decodeCsv(Buffer.from("구,동,지번\n영등포구,여의도동,50", "utf8"))).toBe("구,동,지번\n영등포구,여의도동,50");
  });

  it("UTF-8 BOM은 지움", () => {
    expect(decodeCsv(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("구,동,지번", "utf8")]))).toBe("구,동,지번");
  });

  it("엑셀이 저장하는 EUC-KR(cp949) 파일도 한글이 깨지지 않음", () => {
    const text = "구,동,지번\n영등포구,여의도동,50";
    expect(decodeCsv(iconv.encode(text, "cp949"))).toBe(text);
  });
});

describe("parseSampleCsv — 표본 파일 읽기", () => {
  it("구·동·지번 열", () => {
    const r = parseSampleCsv("구,동,지번\n영등포구,여의도동,50\n도봉구,창동,9\n");
    expect(r.problems).toEqual([]);
    expect(r.rows).toEqual([
      { line: 2, sigungu: "영등포구", dong: "여의도동", jibun: "50" },
      { line: 3, sigungu: "도봉구", dong: "창동", jibun: "9" },
    ]);
  });

  it("비슷한 열 이름(시군구·법정동·번지)과 열 이름 속 공백도 허용", () => {
    const r = parseSampleCsv("시군구, 법정동 ,번지\n영등포구,여의도동,50");
    expect(r.rows).toHaveLength(1);
    expect(r.problems).toEqual([]);
  });

  it("주소 한 칸으로 적어도 구·동·지번을 뽑음 (산 지번, 동 이름의 1가 포함)", () => {
    const r = parseSampleCsv("주소\n서울특별시 영등포구 여의도동 50\n영등포구 영등포동1가 7-2\n서울특별시 도봉구 방학동 산 89-2");
    expect(r.problems).toEqual([]);
    expect(r.rows.map((x) => [x.sigungu, x.dong, x.jibun])).toEqual([
      ["영등포구", "여의도동", "50"],
      ["영등포구", "영등포동1가", "7-2"],
      ["도봉구", "방학동", "산 89-2"],
    ]);
  });

  it("읽지 못한 줄은 몇 번째 줄인지 알려주고, 나머지는 계속 읽음", () => {
    const r = parseSampleCsv("구,동,지번\n영등포구,여의도동,50\n영등포구,,60\n도봉구,창동,9");
    expect(r.rows).toHaveLength(2);
    expect(r.problems).toEqual(["3줄: 구·동·지번 중 빈 칸이 있어요"]);
  });

  it("빈 줄(,, 포함)은 건너뛰되, 그 뒤 줄 번호도 파일의 실제 줄 번호와 같게 안내", () => {
    // 1 머리글 / 2 정상 / 3 빈 줄 / 4 동이 비어 있음 / 5 ,, / 6 정상
    const r = parseSampleCsv("구,동,지번\n영등포구,여의도동,50\n\n영등포구,,60\n,,\n도봉구,창동,9\n");
    expect(r.problems).toEqual(["4줄: 구·동·지번 중 빈 칸이 있어요"]);
    expect(r.rows.map((x) => x.line)).toEqual([2, 6]);
  });

  it("주소를 해석하지 못하면 줄 번호와 함께 알려줌", () => {
    const r = parseSampleCsv("주소\n서울 어딘가 123");
    expect(r.rows).toEqual([]);
    expect(r.problems[0]).toContain("2줄: 주소에서 구·동·지번을 찾지 못했어요");
  });

  it("필요한 열이 없으면 현재 첫 줄과 함께 안내", () => {
    const r = parseSampleCsv("이름,메모\n가,나");
    expect(r.rows).toEqual([]);
    expect(r.problems[0]).toContain("열 이름을 찾지 못했어요");
    expect(r.problems[0]).toContain("이름, 메모");
  });
});

describe("checkSample — 후보에 들어오는지 비교", () => {
  it("후보·제외·확인 필요·못 찾음으로 나누고 후보 비율을 계산 (확인 필요는 포함으로 세지 않음)", () => {
    const rows = [
      row("영등포구", "여의도동", "50", 2), // 후보
      row("영등포구", "여의도동", "51", 3), // 제외
      row("영등포구", "여의도동", "53", 4), // 확인 필요
      row("영등포구", "여의도동", "999", 5), // 못 찾음
    ];
    const r = checkSample(rows, parcels, DEFAULT_CONDITIONS);
    expect(r).toMatchObject({ total: 4, candidate: 1, needsCheck: 1, excluded: 1, notFound: 1, rate: 0.25 });
  });

  it("제외된 표본은 어떤 조건 때문인지 이유를 알려줌 (면적·지목·용도지역)", () => {
    const [small, mixed] = checkSample([row("영등포구", "여의도동", "51"), row("영등포구", "여의도동", "52")], parcels, DEFAULT_CONDITIONS).items;
    expect(small.outcome).toEqual({ kind: "excluded", reasons: ["면적 980㎡ (기준: 1,000㎡ 이상)"] });
    expect(mixed.outcome).toMatchObject({ kind: "excluded" });
    const reasons = (mixed.outcome as { reasons: string[] }).reasons;
    expect(reasons).toHaveLength(2);
    expect(reasons[0]).toContain("지목 전");
    expect(reasons[1]).toContain("용도지역 제2종일반주거지역");
  });

  it("지번을 다르게 적어도 같은 필지로 찾음 (산 12-3 / 산12-3, 구 이름의 '구' 생략, 12-0)", () => {
    const rows = [row("영등포구", "여의도동", "산12-3"), row("영등포", "영등포동1가", "7-2"), row("영등포구", "여의도동", "50-0"), row("도봉구", "창동", "9번지")];
    const r = checkSample(rows, parcels, DEFAULT_CONDITIONS);
    expect(r).toMatchObject({ total: 4, candidate: 4, rate: 1 });
  });

  it("같은 필지를 두 번 적으면 한 건으로 세고 중복 줄을 알려줌", () => {
    const r = checkSample([row("영등포구", "여의도동", "50", 2), row("영등포구", "여의도동", "50", 3)], parcels, DEFAULT_CONDITIONS);
    expect(r.total).toBe(1);
    expect(r.duplicateLines).toEqual([3]);
  });

  it("표본이 비면 비율 0 (0으로 나누지 않음)", () => {
    expect(checkSample([], parcels, DEFAULT_CONDITIONS)).toMatchObject({ total: 0, rate: 0 });
  });

  it("조건을 바꾸면 결과도 바뀜 (면적 100 이상이면 980㎡도 후보)", () => {
    const r = checkSample([row("영등포구", "여의도동", "51")], parcels, { ...DEFAULT_CONDITIONS, minArea: 100 });
    expect(r.candidate).toBe(1);
  });
});

describe("explainExclusion — 제외 이유", () => {
  it("두 번째 용도지역만 맞는 경우, 판정은 주된 용도지역 기준이라는 설명이 붙음", () => {
    const reasons = explainExclusion(parcel({ zone1: "제2종일반주거지역", zone2: "준주거지역" }), DEFAULT_CONDITIONS);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("두 번째 용도지역 준주거지역은(는) 조건에 맞지만 판정은 주된 용도지역 기준");
  });
});

describe("formatSampleReport — 결과 글", () => {
  it("90% 이상이면 통과, 못 들어온 표본은 이유와 함께 나열", () => {
    const rows = Array.from({ length: 50 }, (_, i) => row("영등포구", "여의도동", i === 0 ? "51" : "50", i + 2));
    // 같은 필지(50)는 중복이라 한 건으로 세므로, 서로 다른 필지로 50건을 만든다
    const many: Parcel[] = Array.from({ length: 50 }, (_, i) => parcel({ jibun: String(100 + i), area: i === 0 ? 500 : 5000 }));
    const sample = many.map((p, i) => row("영등포구", "여의도동", p.jibun, i + 2));
    const report = checkSample(sample, many, DEFAULT_CONDITIONS);
    const text = formatSampleReport(report, DEFAULT_CONDITIONS);
    expect(rows).toHaveLength(50);
    expect(text).toContain("표본 50건 중 후보에 포함 49건 → 98.0%");
    expect(text).toContain("✅ 통과");
    expect(text).toContain("❌ 2줄 영등포구 여의도동 100 — 제외: 면적 500㎡");
  });

  it("목표에 못 미치면 미달, 건수가 50이 아니면 알려줌", () => {
    const report = checkSample([row("영등포구", "여의도동", "51")], parcels, DEFAULT_CONDITIONS);
    const text = formatSampleReport(report, DEFAULT_CONDITIONS);
    expect(text).toContain("❌ 미달");
    expect(text).toContain("표본은 50건이 기준이에요 (지금 1건)");
  });

  it("못 찾은 표본은 지번·동 이름 확인을 안내", () => {
    const text = formatSampleReport(checkSample([row("영등포구", "여의도동", "999")], parcels, DEFAULT_CONDITIONS), DEFAULT_CONDITIONS);
    expect(text).toContain("데이터에서 찾지 못했어요 (지번·동 이름을 확인해 주세요)");
  });
});
