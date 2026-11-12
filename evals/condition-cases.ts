// 말로 입력한 조건 변환 정확도 측정용 문장 20개와 기대값 (PLAN 작업 16, 성공 기준 SC-4)
// Design Ref: §10.5 — 조건 문장 20개: 정상 14 · 애매함 3 · 지원 안 함 3
//
// 중요: 기대값은 측정을 실행하기 전에 정해서 고정한다. 결과를 보고 기대값이나 문장을 바꾸지 않는다.
// 지시문(lib/parse-condition.ts)을 다듬을 때 확인용으로 쓴 문장과 겹치지 않는 새 문장이다.

const COMMERCIAL = ["중심상업지역", "일반상업지역", "근린상업지역", "유통상업지역"];
const GREEN = ["보전녹지지역", "생산녹지지역", "자연녹지지역"];

/** 정상: 조건으로 바뀌어야 함. "default"는 문장에서 말하지 않아 기본 조건이 쓰여야 하는 항목 */
export interface OkCase {
  text: string;
  status: "ok";
  minArea: number | "default";
  landCategories: string[] | "default";
  zones: string[] | "default";
  /** 기대하는 소유구분. 적지 않으면 "소유구분을 말하지 않았으므로 조건에 소유구분이 없어야 함" */
  owners?: string[];
  /** 기대하는 지역(구). 적지 않으면 "지역을 말하지 않았으므로 조건에 지역이 없어야 함" */
  districts?: string[];
  /** 면적 허용 오차(㎡) — "평" 단위 환산의 반올림 차이를 인정한다 */
  areaTolerance?: number;
  note: string;
}

/** 되묻기·지원 안 함: 해당 안내가 나와야 하고 조건은 없어야 함 */
export interface NoticeCase {
  text: string;
  status: "need_clarification" | "unsupported";
  note: string;
}

export type ConditionCase = OkCase | NoticeCase;

export const CONDITION_CASES: ConditionCase[] = [
  // ───── 정상 14 ─────
  { text: "일반상업지역 대지 1500㎡ 이상", status: "ok", minArea: 1500, landCategories: ["대"], zones: ["일반상업지역"], note: "세 조건을 모두 말함" },
  { text: "제3종일반주거지역만 보여줘", status: "ok", minArea: "default", landCategories: "default", zones: ["제3종일반주거지역"], note: "용도지역만 말함" },
  { text: "면적은 2,500㎡ 이상으로 해줘", status: "ok", minArea: 2500, landCategories: "default", zones: "default", note: "쉼표가 있는 숫자" },
  { text: "준주거지역이나 일반상업지역에서 면적 4천 이상", status: "ok", minArea: 4000, landCategories: "default", zones: ["준주거지역", "일반상업지역"], note: "용도지역 둘, '천' 단위" },
  { text: "3천 제곱미터 넘는 일반상업지역", status: "ok", minArea: 3000, landCategories: "default", zones: ["일반상업지역"], note: "'넘는'은 이상으로 해석하는 규칙" },
  { text: "500평 이상 준공업지역 공장용지", status: "ok", minArea: 1653, areaTolerance: 2, landCategories: ["공장용지"], zones: ["준공업지역"], note: "평 환산 (1평=3.3058㎡)" },
  { text: "지목은 대 또는 잡종지, 용도지역은 준주거지역", status: "ok", minArea: "default", landCategories: ["대", "잡종지"], zones: ["준주거지역"], note: "지목 둘" },
  { text: "1만 5천㎡ 이상 상업지역", status: "ok", minArea: 15000, landCategories: "default", zones: COMMERCIAL, note: "'만 천' 복합 단위, 큰 분류 풀이" },
  { text: "녹지지역에서 1만㎡ 이상", status: "ok", minArea: 10000, landCategories: "default", zones: GREEN, note: "큰 분류 풀이(녹지)" },
  { text: "전·답 말고 대지만, 면적 1200 이상 준주거", status: "ok", minArea: 1200, landCategories: ["대"], zones: ["준주거지역"], note: "부정 표현이 섞임" },
  { text: "면적 이천 제곱미터 이상 준주거지역", status: "ok", minArea: 2000, landCategories: "default", zones: ["준주거지역"], note: "한글 숫자" },
  { text: "준주거지역 대지 2000㎡ 이상이고 제3종일반주거지역도 포함", status: "ok", minArea: 2000, landCategories: ["대"], zones: ["준주거지역", "제3종일반주거지역"], note: "'도 포함'으로 추가" },
  { text: "2천평 이상", status: "ok", minArea: 6612, areaTolerance: 2, landCategories: "default", zones: "default", note: "면적만, 평 환산" },
  { text: "관리지역 중에서 계획관리지역만 3천㎡ 이상", status: "ok", minArea: 3000, landCategories: "default", zones: ["계획관리지역"], note: "큰 분류 안에서 하나만" },

  // ───── 소유구분 3 (2026-11-12 서울 확장·소유구분 추가 때 더함. 기대값은 문장을 쓰는 시점에 고정함) ─────
  { text: "국유지만 보여줘", status: "ok", minArea: "default", landCategories: "default", zones: "default", owners: ["국유지"], note: "소유구분만 말함" },
  { text: "국가 땅 중에서 5천㎡ 이상 준주거지역", status: "ok", minArea: 5000, landCategories: "default", zones: ["준주거지역"], owners: ["국유지"], note: "국가 땅 표현" },
  { text: "공유지에서 상업지역 1500㎡ 이상", status: "ok", minArea: 1500, landCategories: "default", zones: COMMERCIAL, owners: ["시·도유지", "군유지"], note: "공유지 풀이 + 큰 분류" },

  // ───── 지역(구) 2 (2026-11-12 구 선택 추가 때 더함. "도봉구에 있는 것만 보여줘"는 지원 안 함에서 정상으로 옮김) ─────
  { text: "도봉구에 있는 것만 보여줘", status: "ok", minArea: "default", landCategories: "default", zones: "default", districts: ["도봉구"], note: "구 한정 (이전에는 지원 안 함이었음)" },
  { text: "강남이랑 서초에서 면적 2천㎡ 이상 국유지", status: "ok", minArea: 2000, landCategories: "default", zones: "default", owners: ["국유지"], districts: ["강남구", "서초구"], note: "구 둘 + 소유구분 + 줄임말" },

  // ───── 애매함 3 (숫자가 필요한데 없음 → 되묻기) ─────
  { text: "너무 작지 않은 땅", status: "need_clarification", note: "크기 기준이 숫자로 없음" },
  { text: "큰 대지만 골라줘", status: "need_clarification", note: "'큰'의 기준이 없음" },
  { text: "중간 정도 크기의 준주거지역 땅", status: "need_clarification", note: "'중간 정도'의 기준이 없음" },

  // ───── 지원 안 함 3 ─────
  { text: "공시지가가 제일 낮은 순서로 정렬해줘", status: "unsupported", note: "가격·정렬" },
  { text: "건축물이 없는 나대지", status: "unsupported", note: "건물 유무" },
  { text: "소유자가 홍길동인 필지", status: "unsupported", note: "소유자 이름 (소유구분이 아님)" },
  { text: "여의도동에 있는 대지만", status: "unsupported", note: "동 단위 지역 (구까지만 지원)" },
];
