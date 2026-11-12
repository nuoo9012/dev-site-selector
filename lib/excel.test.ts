// 엑셀 만들기 자동 검사 (PLAN 작업 11)
// Design Ref: §3.4 — 두 시트의 상단 안내·표 열·빈 칸 처리·전체 건수. 실행: npm test

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONDITIONS } from "./conditions";
import { buildExcel, excelFileName, SHEET_CANDIDATES, SHEET_NEEDS_CHECK, type ExcelInput } from "./excel";
import { DISCLAIMER } from "./format";
import { PARCEL_DATA } from "./parcels";
import { selectParcels } from "./selection";
import type { Parcel } from "./types";

let seq = 0;
function parcel(overrides: Partial<Parcel> = {}): Parcel {
  seq += 1;
  return {
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

const sameDates = { 영등포구: "2026-05-13", 도봉구: "2026-05-13" };

function inputFrom(parcels: Parcel[], baseDates = sameDates): ExcelInput {
  return { conditions: DEFAULT_CONDITIONS, result: selectParcels(parcels, DEFAULT_CONDITIONS), baseDates };
}

// 엑셀 파일을 실제로 만들고 다시 읽어서 확인한다
async function roundTrip(input: ExcelInput): Promise<ExcelJS.Workbook> {
  const buffer = await buildExcel(input);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

// 한 줄을 값 배열로 읽는다 (빈 칸은 null, 7칸까지)
function rowValues(sheet: ExcelJS.Worksheet, rowNumber: number): (string | number | null)[] {
  return [1, 2, 3, 4, 5, 6, 7].map((c) => {
    const v = sheet.getRow(rowNumber).getCell(c).value;
    return v === null || v === undefined ? null : (v as string | number);
  });
}

describe("buildExcel — 시트 구성", () => {
  it("시트가 '후보 목록', '확인 필요' 두 개이고 이 순서", async () => {
    const wb = await roundTrip(inputFrom([parcel()]));
    expect(wb.worksheets.map((s) => s.name)).toEqual([SHEET_CANDIDATES, SHEET_NEEDS_CHECK]);
  });

  it("두 시트 모두 상단 1~3행에 적용 조건·기준일·안내 문구가 있음", async () => {
    const wb = await roundTrip(inputFrom([parcel()]));
    for (const name of [SHEET_CANDIDATES, SHEET_NEEDS_CHECK]) {
      const sheet = wb.getWorksheet(name)!;
      expect(sheet.getCell("A1").value).toBe(
        "적용 조건: 면적 1,000㎡ 이상 · 지목 대 · 용도지역 일반상업지역, 준주거지역, 제3종일반주거지역",
      );
      expect(sheet.getCell("A2").value).toBe("데이터 기준일 2026-05-13");
      expect(sheet.getCell("A3").value).toBe(`※ ${DISCLAIMER}`);
    }
  });

  it("두 구의 기준일이 다르면 구별로 모두 표시", async () => {
    const wb = await roundTrip(inputFrom([parcel()], { 영등포구: "2026-05-13", 도봉구: "2026-04-02" }));
    expect(wb.getWorksheet(SHEET_CANDIDATES)!.getCell("A2").value).toBe(
      "데이터 기준일 영등포구 2026-05-13 / 도봉구 2026-04-02",
    );
  });

  it("표 머리글이 5행에 있고 시트마다 마지막 열만 다름", async () => {
    const wb = await roundTrip(inputFrom([parcel()]));
    expect(rowValues(wb.getWorksheet(SHEET_CANDIDATES)!, 5)).toEqual(["주소", "지번", "지목", "면적(㎡)", "용도지역", "소유구분", "선별 근거"]);
    expect(rowValues(wb.getWorksheet(SHEET_NEEDS_CHECK)!, 5)).toEqual(["주소", "지번", "지목", "면적(㎡)", "용도지역", "소유구분", "비어 있는 항목"]);
  });
});

describe("buildExcel — 후보 목록 시트", () => {
  it("후보 한 건이 7칸으로 들어가고 면적은 숫자 값", async () => {
    const p = parcel({ area: 1523.4, zone2: "일반상업지역" });
    const wb = await roundTrip(inputFrom([p]));
    const sheet = wb.getWorksheet(SHEET_CANDIDATES)!;
    expect(rowValues(sheet, 6)).toEqual([
      p.address,
      p.jibun,
      "대",
      1523.4,
      "준주거지역",
      null, // 소유정보가 없으면 빈 칸
      "면적 1,523.4㎡(≥1,000) · 지목 대 · 준주거지역 (일부 일반상업지역 걸침)",
    ]);
    expect(typeof sheet.getRow(6).getCell(4).value).toBe("number");
  });

  it("면적 표시 형식: 정수는 쉼표만, 소수는 소수점 유지", async () => {
    const wb = await roundTrip(inputFrom([parcel({ area: 2000 }), parcel({ area: 1523.4 })]));
    const sheet = wb.getWorksheet(SHEET_CANDIDATES)!;
    expect(sheet.getRow(6).getCell(4).numFmt).toBe("#,##0"); // 면적 2,000 (큰 순서라 먼저)
    expect(sheet.getRow(7).getCell(4).numFmt).toBe("#,##0.0#");
  });

  it("후보는 면적이 큰 순서로 들어가고 선별 근거 칸에 빈칸이 없음 (SC-2)", async () => {
    const wb = await roundTrip(inputFrom([parcel({ area: 1200 }), parcel({ area: 3000 }), parcel({ area: 2000 })]));
    const sheet = wb.getWorksheet(SHEET_CANDIDATES)!;
    expect([6, 7, 8].map((r) => sheet.getRow(r).getCell(4).value)).toEqual([3000, 2000, 1200]);
    expect([6, 7, 8].every((r) => String(sheet.getRow(r).getCell(7).value ?? "").length > 0)).toBe(true);
    expect(sheet.getRow(9).getCell(1).value).toBeNull(); // 그 아래는 비어 있음
  });

  it("화면용 500건 제한 없이 전체 건수가 들어감", async () => {
    const many = Array.from({ length: 600 }, (_, i) => parcel({ area: 1000 + i }));
    const wb = await roundTrip(inputFrom(many));
    const sheet = wb.getWorksheet(SHEET_CANDIDATES)!;
    expect(sheet.rowCount).toBe(5 + 600);
    expect(sheet.getRow(5 + 600).getCell(1).value).not.toBeNull();
  });

  it("후보가 0건이어도 머리글만 있는 시트가 만들어짐", async () => {
    const wb = await roundTrip(inputFrom([parcel({ area: 10 })]));
    const sheet = wb.getWorksheet(SHEET_CANDIDATES)!;
    expect(rowValues(sheet, 5)[0]).toBe("주소");
    expect(sheet.getRow(6).getCell(1).value).toBeNull();
  });
});

describe("buildExcel — 확인 필요 시트", () => {
  it("비어 있는 값은 'null' 글자가 아니라 빈 칸이고, 비어 있는 항목이 적힘", async () => {
    const empty = parcel({ landCategory: null, area: null, zone1: null });
    const wb = await roundTrip(inputFrom([empty]));
    const sheet = wb.getWorksheet(SHEET_NEEDS_CHECK)!;
    expect(rowValues(sheet, 6)).toEqual([empty.address, empty.jibun, null, null, null, null, "지목, 면적, 용도지역"]);
  });

  it("일부만 비면 그 항목만 적히고 있는 값은 그대로 보임", async () => {
    const p = parcel({ area: null });
    const wb = await roundTrip(inputFrom([p]));
    expect(rowValues(wb.getWorksheet(SHEET_NEEDS_CHECK)!, 6)).toEqual([p.address, p.jibun, "대", null, "준주거지역", null, "면적"]);
  });

  it("후보와 확인 필요가 서로 다른 시트에 나뉘어 들어감", async () => {
    const ok = parcel();
    const empty = parcel({ landCategory: null, area: null, zone1: null });
    const wb = await roundTrip(inputFrom([ok, empty]));
    expect(wb.getWorksheet(SHEET_CANDIDATES)!.getRow(6).getCell(2).value).toBe(ok.jibun);
    expect(wb.getWorksheet(SHEET_CANDIDATES)!.getRow(7).getCell(1).value).toBeNull();
    expect(wb.getWorksheet(SHEET_NEEDS_CHECK)!.getRow(6).getCell(2).value).toBe(empty.jibun);
  });
});

describe("buildExcel — 실제 데이터 (data/parcels.json)", () => {
  it("시트 줄 수가 선별 결과 전체 건수와 같음 (건수 숫자는 데이터가 바뀌어도 맞도록 계산으로 비교)", async () => {
    const result = selectParcels(PARCEL_DATA.parcels, DEFAULT_CONDITIONS);
    const wb = await roundTrip({ conditions: DEFAULT_CONDITIONS, result, baseDates: PARCEL_DATA.meta.baseDates });
    // 표는 5행(머리글) 아래부터 시작 — 줄 수 = 5 + 건수
    expect(wb.getWorksheet(SHEET_CANDIDATES)!.rowCount).toBe(5 + result.candidates.length);
    expect(wb.getWorksheet(SHEET_NEEDS_CHECK)!.rowCount).toBe(5 + result.needsCheck.length);
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});

describe("excelFileName — 파일 이름", () => {
  it("개발대상지_YYYYMMDD.xlsx 형식", () => {
    expect(excelFileName(new Date("2026-11-12T03:00:00Z"))).toBe("개발대상지_20261112.xlsx");
  });

  it("한국 시간 기준 날짜를 씀 (서버는 세계 표준시라서 아침에 하루 전 날짜가 되지 않게)", () => {
    // 세계 표준시 11월 11일 16:00 = 한국 시간 11월 12일 01:00
    expect(excelFileName(new Date("2026-11-11T16:00:00Z"))).toBe("개발대상지_20261112.xlsx");
    // 세계 표준시 11월 12일 14:59 = 한국 시간 11월 12일 23:59
    expect(excelFileName(new Date("2026-11-12T14:59:00Z"))).toBe("개발대상지_20261112.xlsx");
    // 세계 표준시 11월 12일 15:00 = 한국 시간 11월 13일 00:00
    expect(excelFileName(new Date("2026-11-12T15:00:00Z"))).toBe("개발대상지_20261113.xlsx");
  });
});

describe("buildExcel — 보기 편의", () => {
  it("머리글 아래가 고정되고 필터가 달림", async () => {
    const wb = await roundTrip(inputFrom([parcel()]));
    for (const name of [SHEET_CANDIDATES, SHEET_NEEDS_CHECK]) {
      const sheet = wb.getWorksheet(name)!;
      expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 5 });
      expect(sheet.autoFilter).toBeTruthy();
    }
  });
});

describe("buildExcel — 소유구분", () => {
  it("소유구분 칸에 목록과 국가기관이 적히고, 상단 기준일 줄에 소유구분 기준일이 붙음", async () => {
    const state = parcel({ owners: ["국유지"], ownerAgency: "중앙부처" });
    const shared = parcel({ area: 1200, owners: ["국유지", "개인"], ownerAgency: null });
    const wb = await roundTrip({
      conditions: { ...DEFAULT_CONDITIONS, owners: ["국유지"] },
      result: selectParcels([state, shared], { ...DEFAULT_CONDITIONS, owners: ["국유지"] }),
      baseDates: sameDates,
      ownerBaseDate: "2026-10-28",
    });
    const sheet = wb.getWorksheet(SHEET_CANDIDATES)!;
    expect(sheet.getRow(6).getCell(6).value).toBe("국유지(중앙부처)");
    expect(sheet.getRow(7).getCell(6).value).toBe("국유지·개인");
    expect(sheet.getCell("A1").value).toBe("적용 조건: 면적 1,000㎡ 이상 · 지목 대 · 용도지역 일반상업지역, 준주거지역, 제3종일반주거지역 · 소유구분 국유지");
    expect(sheet.getCell("A2").value).toBe("데이터 기준일 2026-05-13 · 소유구분 기준일 2026-10-28");
    expect(String(sheet.getRow(6).getCell(7).value)).toContain("소유 국유지(중앙부처)");
  });
});
