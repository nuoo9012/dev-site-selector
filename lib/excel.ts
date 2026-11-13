// 선별 결과를 엑셀 파일로 만든다 (PLAN 작업 11)
// Design Ref: §3.4 — 두 시트 모두 상단 1~3행에 적용 조건·구별 기준일·안내 문구, 그 아래 표
//   · "후보 목록" 시트: 주소 · 지번 · 지목 · 면적 · 용도지역 · 소유구분 · 토지이용상황 · 지형형상 · 공시지가 · 토지가액 · 선별 근거
//   · "확인 필요" 시트: 주소 · 지번 · 지목 · 면적 · 용도지역 · 소유구분 · 토지이용상황 · 지형형상 · 공시지가 · 토지가액 · 비어 있는 항목
// 서버 쪽 코드(API)에서만 쓴다. 화면에 보이는 500건 제한 없이 전체 건수를 담는다 (PRD must ②).

import ExcelJS from "exceljs";
import { DISCLAIMER, formatBaseDates, formatConditions } from "./format";
import { landValue } from "./land-value";
import { ownerText } from "./owner-text";
import type { BaseDates, Conditions, Parcel, SelectionResult } from "./types";

export const SHEET_CANDIDATES = "후보 목록";
export const SHEET_NEEDS_CHECK = "확인 필요";

/** 상단 안내 3줄 + 빈 줄 1줄 다음 줄이 표 머리글 */
const HEADER_ROW = 5;

export interface ExcelInput {
  /** 실제로 적용한 조건 */
  conditions: Conditions;
  /** 선별 결과 전체 (화면용 500건 제한이 걸리지 않은 것) */
  result: SelectionResult;
  /** 구별 원본 데이터 기준일 */
  baseDates: BaseDates;
  /** 소유구분(토지소유정보)의 기준일. 없으면 적지 않는다 */
  ownerBaseDate?: string | null;
}

interface Column {
  header: string;
  width: number;
}

// 두 시트가 같은 앞 10열을 쓰고 마지막 열만 다르다 (Design Ref: §3.4)
const SHARED_COLUMNS: Column[] = [
  { header: "주소", width: 34 },
  { header: "지번", width: 12 },
  { header: "지목", width: 10 },
  { header: "면적(㎡)", width: 14 },
  { header: "용도지역", width: 22 },
  { header: "소유구분", width: 18 },
  { header: "토지이용상황", width: 14 },
  { header: "지형형상", width: 12 },
  { header: "공시지가(원/㎡)", width: 16 },
  { header: "토지가액(원)", width: 20 },
];

// 필지 한 건의 앞 10칸 값. 값이 없으면 null → 빈 칸 (엑셀에 "null"이 보이지 않게)
function parcelCells(p: Parcel): (string | number | null)[] {
  return [p.address, p.jibun, p.landCategory, p.area, p.zone1, ownerText(p), p.landUse ?? null, p.landShape ?? null, p.landPrice ?? null, landValue(p)];
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  lastColumn: Column,
  rows: (string | number | null)[][],
  input: ExcelInput,
) {
  const sheet = workbook.addWorksheet(name);
  const columns = [...SHARED_COLUMNS, lastColumn];
  columns.forEach((col, i) => {
    sheet.getColumn(i + 1).width = col.width;
  });

  // 상단 1~3행: 적용 조건 · 구별 기준일 · 안내 문구 (병합하지 않아도 옆 빈 칸으로 글이 이어져 보인다)
  sheet.getCell("A1").value = `적용 조건: ${formatConditions(input.conditions)}`;
  sheet.getCell("A2").value = formatBaseDates(input.baseDates) + (input.ownerBaseDate ? ` · 소유구분 기준일 ${input.ownerBaseDate}` : "");
  sheet.getCell("A3").value = `※ ${DISCLAIMER}`;
  sheet.getCell("A1").font = { bold: true };

  // 표 머리글
  const header = sheet.getRow(HEADER_ROW);
  columns.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E7" } };
    cell.border = { bottom: { style: "thin" } };
    // 면적 열은 숫자라서 머리글도 오른쪽 정렬
    if (col.header.startsWith("면적") || col.header.startsWith("공시지가") || col.header.startsWith("토지가액")) cell.alignment = { horizontal: "right" };
  });

  // 표 내용
  rows.forEach((values, r) => {
    const row = sheet.getRow(HEADER_ROW + 1 + r);
    values.forEach((value, i) => {
      const cell = row.getCell(i + 1);
      if (value !== null) cell.value = value;
      // 면적(4번째 열): 정수는 1,523 / 소수는 1,523.4로 쉼표 표시 (숫자 값 그대로 유지)
      if (i === 3 && typeof value === "number") {
        cell.numFmt = Number.isInteger(value) ? "#,##0" : "#,##0.0#";
      }
      // 공시지가(9번째)·토지가액(10번째)은 원 단위 정수 (숫자 값 그대로 유지)
      if ((i === 8 || i === 9) && typeof value === "number") cell.numFmt = "#,##0";
    });
  });

  // 머리글 아래부터 스크롤되고, 머리글에 필터 단추를 단다
  sheet.views = [{ state: "frozen", ySplit: HEADER_ROW }];
  sheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW, column: columns.length },
  };
}

/** 선별 결과로 엑셀 통합 문서를 만든다 */
export function buildWorkbook(input: ExcelInput): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "나라땅 줍줍단";
  workbook.title = "개발 대상지 선별 결과";

  addSheet(
    workbook,
    SHEET_CANDIDATES,
    { header: "선별 근거", width: 70 },
    input.result.candidates.map((c) => [...parcelCells(c), c.reason]),
    input,
  );
  addSheet(
    workbook,
    SHEET_NEEDS_CHECK,
    { header: "비어 있는 항목", width: 24 },
    input.result.needsCheck.map((n) => [...parcelCells(n.parcel), n.missing.join(", ")]),
    input,
  );
  return workbook;
}

/** 통합 문서를 .xlsx 파일 내용(바이트)으로 바꾼다 */
export async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  // exceljs가 따로 선언한 Buffer 타입을 Node의 Buffer로 맞춘다 (바이트 내용은 같다)
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * 내려받는 파일 이름: 개발대상지_YYYYMMDD.xlsx (Design Ref: §3.4)
 * 날짜는 한국 시간 기준이다. 서버(Vercel)는 세계 표준시라서 그대로 쓰면 아침에 하루 전 날짜가 된다.
 */
export function excelFileName(now: Date = new Date()): string {
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now); // 2026-11-12
  return `개발대상지_${date.replaceAll("-", "")}.xlsx`;
}

/** 선별 결과를 바로 .xlsx 파일 내용으로 만든다 */
export async function buildExcel(input: ExcelInput): Promise<Buffer> {
  return workbookToBuffer(buildWorkbook(input));
}
