// 공시지가·토지가액 계산과 표시 — 화면(브라우저)과 엑셀(서버)이 같은 값을 쓰도록 한곳에 둔다. 가볍게 유지한다.
// 토지가액 = 개별공시지가(원/㎡) × 토지면적(㎡). 과세·평가용 기준값으로 계산한 참고값이며 실제 거래 가격과 다를 수 있다.
// 공시지가나 면적이 비어 있으면 추측하지 않고 null(값 없음)을 돌려준다.

import type { Parcel } from "./types";

/** 토지가액(원) = 공시지가 × 면적, 원 단위로 반올림. 둘 중 하나라도 없으면 null */
export function landValue(p: { landPrice?: Parcel["landPrice"]; area?: Parcel["area"] | undefined }): number | null {
  if (p.landPrice === null || p.landPrice === undefined || p.area === null || p.area === undefined) return null;
  return Math.round(p.landPrice * p.area);
}

/** 원 단위 금액을 쉼표로 (예: 884000 → "884,000원"). 값이 없으면 null */
export function formatWon(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return `${value.toLocaleString("ko-KR")}원`;
}

/**
 * 큰 금액을 읽기 쉽게 줄여서 (예: 3,119,133,600,000 → "약 3.1조 원", 120,000,000 → "약 1.2억 원").
 * 정확한 값은 formatWon으로 따로 보여주고, 이 값은 옆에 붙이는 어림값이다.
 */
export function formatWonApprox(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const abs = Math.abs(value);
  if (abs >= 1e12) return `약 ${(value / 1e12).toFixed(1)}조 원`;
  if (abs >= 1e8) return `약 ${abs >= 1e10 ? Math.round(value / 1e8).toLocaleString("ko-KR") : (value / 1e8).toFixed(1)}억 원`;
  if (abs >= 1e4) return `약 ${Math.round(value / 1e4).toLocaleString("ko-KR")}만 원`;
  return null; // 1만 원 미만은 어림값이 필요 없다
}

/** 토지가액을 보여주는 곳에 함께 적는 안내 */
export const LAND_VALUE_NOTE = "토지가액은 공시지가 × 면적으로 계산한 참고값이에요. 실제 거래 가격과는 다를 수 있어요.";
