// 선별 계산 — 앱의 핵심 (PLAN 작업 5)
// Design Ref: §3.2, §4.3 — 판정은 AI가 아니라 이 코드가 한다. 같은 조건이면 항상 같은 결과.
// 이 파일은 화면·서버와 떨어진 순수 계산이라 자동 검사(작업 8)로 확인할 수 있다.

import type {
  Candidate,
  Conditions,
  Judgement,
  MissingField,
  NeedsCheckItem,
  Parcel,
  SelectionResult,
} from "./types";

// 숫자를 "1,523" "1,523.4"처럼 쉼표와 소수 둘째 자리까지 표시
const numberFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

/**
 * 필지 한 건을 조건과 비교해 판정한다.
 * 판정 순서 (PRD must ① 규칙 7):
 *   1. 값이 있는 항목만 조건과 비교해 하나라도 안 맞으면 → 제외
 *   2. 남은 필지 중 빈 값이 있으면 → 확인 필요(unknown)
 *   3. 모두 있고 모두 맞으면 → 후보(match)
 * 용도지역은 주된 용도지역(zone1)만 본다 (PRD must ① 기본 선별 조건 표 아래 규칙).
 */
export function judgeParcel(parcel: Parcel, conditions: Conditions): Judgement {
  const { landCategory, area, zone1 } = parcel;

  // 지역(구): 구는 항상 알려져 있으므로 원하는 구가 아니면 바로 제외
  const wantedDistricts = conditions.districts ?? [];
  if (wantedDistricts.length > 0 && !wantedDistricts.includes(parcel.sigungu)) return { result: "exclude" };

  // 1. 알려진 값 중 하나라도 안 맞으면 제외 (다른 값이 비어 있어도 제외)
  if (landCategory !== null && !conditions.landCategories.includes(landCategory)) return { result: "exclude" };
  if (area !== null && area < conditions.minArea) return { result: "exclude" };
  if (zone1 !== null && !conditions.zones.includes(zone1)) return { result: "exclude" };
  // 소유구분: 필지의 소유구분 중 하나라도 원하는 구분이면 해당(공유 지분 포함). 하나도 아니면 제외
  const wantedOwners = conditions.owners ?? [];
  if (wantedOwners.length > 0 && parcel.owners && !parcel.owners.some((o) => wantedOwners.includes(o))) return { result: "exclude" };

  // 2. 빈 값이 있으면 확인 필요 (값을 추측해서 채우지 않음 — PRD must ① 규칙 8)
  const missing: MissingField[] = [];
  if (landCategory === null) missing.push("지목");
  if (area === null) missing.push("면적");
  if (zone1 === null) missing.push("용도지역");
  // 소유구분을 조건으로 걸었는데 소유정보가 없는 필지는 추측하지 않고 확인 필요로 둔다
  if (wantedOwners.length > 0 && !parcel.owners) missing.push("소유구분");
  if (missing.length) return { result: "unknown", missing };

  // 3. 모두 맞음
  return { result: "match" };
}

/**
 * 후보 정렬 기준: 면적 큰 순, 같으면 고유번호 순 (Design Ref: §3.2 — 같은 조건 = 같은 순서)
 */
export function compareParcels(a: Parcel, b: Parcel): number {
  const byArea = (b.area ?? 0) - (a.area ?? 0);
  return byArea !== 0 ? byArea : a.pnu.localeCompare(b.pnu);
}

/**
 * 후보 필지의 선별 근거 1줄을 만든다 (PLAN 작업 7).
 * 예: "면적 1,523㎡(≥1,000) · 지목 대 · 준주거지역"
 *     두 번째 용도지역이 있으면 "… · 준주거지역 (일부 일반상업지역 걸침)"
 * Design Ref: §4.3 — 용도지역은 주된 용도지역 기준, 걸친 용도지역은 근거에만 표시
 */
export function buildReason(parcel: Parcel, conditions: Conditions): string {
  const parts = [
    `면적 ${numberFormat.format(parcel.area ?? 0)}㎡(≥${numberFormat.format(conditions.minArea)})`,
    `지목 ${parcel.landCategory ?? ""}`,
    parcel.zone1 ?? "",
  ];
  // 소유구분을 조건으로 걸었을 때만 근거에 소유구분을 적는다 (예: "소유 국유지(중앙부처)")
  if ((conditions.owners ?? []).length > 0 && parcel.owners) {
    parts.push(`소유 ${parcel.owners.join("·")}${parcel.ownerAgency ? `(${parcel.ownerAgency})` : ""}`);
  }
  const overlap = parcel.zone2 ? ` (일부 ${parcel.zone2} 걸침)` : "";
  return parts.join(" · ") + overlap;
}

/**
 * 필지 목록을 판정해 후보(근거 포함)와 "확인 필요"로 나눠 돌려준다 (PLAN 작업 5·6·7).
 * 제외된 필지는 담지 않는다.
 */
export function selectParcels(parcels: readonly Parcel[], conditions: Conditions): SelectionResult {
  const candidates: Candidate[] = [];
  const needsCheck: NeedsCheckItem[] = [];

  for (const parcel of parcels) {
    const judgement = judgeParcel(parcel, conditions);
    // Plan SC: SC-3 선별 정확도 — 세 조건을 모두 만족하는 필지만 후보
    // Plan SC: SC-2 근거 표시율 100% — 모든 후보에 근거 1줄을 붙인다
    if (judgement.result === "match") candidates.push({ ...parcel, reason: buildReason(parcel, conditions) });
    // PRD must ① 규칙 7 — 빈 값이 있는 필지는 포함·제외하지 않고 따로 분리
    else if (judgement.result === "unknown") needsCheck.push({ parcel, missing: judgement.missing });
  }

  candidates.sort(compareParcels);
  needsCheck.sort((a, b) => compareParcels(a.parcel, b.parcel));
  return { candidates, needsCheck };
}
