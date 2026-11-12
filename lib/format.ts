// 화면과 엑셀에서 함께 쓰는 문구 만들기 (PLAN 작업 11·15)
// 같은 내용이 화면과 엑셀에서 다르게 보이지 않도록 한곳에서 만든다. 브라우저에서도 쓰므로 가볍게 유지한다.

import type { ConditionKey, Conditions } from "./types";

/** 최종 판단은 담당자가 한다는 안내 문구 (PRD must ② 규칙 4) */
export const DISCLAIMER = "개발 가능 여부의 최종 판단은 담당자가 합니다.";

/**
 * 구별 기준일 문구 (Design Ref: §3.4)
 * 두 구가 같으면 "데이터 기준일 2026-05-13", 다르면 "데이터 기준일 영등포구 … / 도봉구 …"
 */
export function formatBaseDates(dates: Record<string, string>): string {
  const unique = new Set(Object.values(dates));
  if (unique.size === 1) return `데이터 기준일 ${[...unique][0]}`;
  return `데이터 기준일 ${Object.entries(dates)
    .map(([gu, date]) => `${gu} ${date}`)
    .join(" / ")}`;
}

/** 조건 한 항목을 사람이 읽는 줄로 (예: { key: "minArea", label: "면적", value: "1,000㎡ 이상" }) */
export interface ConditionLine {
  key: ConditionKey;
  label: string;
  value: string;
}

/** 조건을 항목별 줄로 바꾼다. 화면의 조건 표시와 엑셀 상단 문구가 같은 글을 쓰도록 한곳에서 만든다. */
export function describeConditions(conditions: Conditions): ConditionLine[] {
  return [
    { key: "minArea", label: "면적", value: `${conditions.minArea.toLocaleString("ko-KR")}㎡ 이상` },
    { key: "landCategories", label: "지목", value: conditions.landCategories.join(", ") },
    { key: "zones", label: "용도지역", value: conditions.zones.join(", ") },
    // 지역·소유구분·땅모양 제외는 골랐을 때만 보여준다
    ...(conditions.excludeShapes && conditions.excludeShapes.length > 0 ? [{ key: "excludeShapes" as const, label: "땅모양 제외", value: conditions.excludeShapes.join(", ") }] : []),
    ...(conditions.districts && conditions.districts.length > 0 ? [{ key: "districts" as const, label: "지역", value: conditions.districts.join(", ") }] : []),
    ...(conditions.owners && conditions.owners.length > 0 ? [{ key: "owners" as const, label: "소유구분", value: conditions.owners.join(", ") }] : []),
  ];
}

/** 적용한 조건을 한 줄로 (예: "면적 1,000㎡ 이상 · 지목 대 · 용도지역 일반상업지역, 준주거지역") */
export function formatConditions(conditions: Conditions): string {
  return describeConditions(conditions)
    .map(({ label, value }) => `${label} ${value}`)
    .join(" · ");
}

/** 글자 수 (이모지처럼 두 칸을 차지하는 글자도 한 글자로 센다). 화면과 서버가 같은 규칙으로 센다. */
export function textLength(text: string): number {
  return Array.from(text).length;
}
