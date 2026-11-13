// 앱 전체에서 함께 쓰는 데이터 모양 (PLAN 작업 3)
// Design Ref: §4.1 — 정리된 필지(data/parcels.json)의 모양과 구별 기준일 정보

/** 대상 구 25개 — 서울 전체 (PRD 6번, 2026-11-12 영등포구·도봉구에서 확장) */
export const SIGUNGU_BY_CODE = {
  "11110": "종로구",
  "11140": "중구",
  "11170": "용산구",
  "11200": "성동구",
  "11215": "광진구",
  "11230": "동대문구",
  "11260": "중랑구",
  "11290": "성북구",
  "11305": "강북구",
  "11320": "도봉구",
  "11350": "노원구",
  "11380": "은평구",
  "11410": "서대문구",
  "11440": "마포구",
  "11470": "양천구",
  "11500": "강서구",
  "11530": "구로구",
  "11545": "금천구",
  "11560": "영등포구",
  "11590": "동작구",
  "11620": "관악구",
  "11650": "서초구",
  "11680": "강남구",
  "11710": "송파구",
  "11740": "강동구",
} as const satisfies Record<string, string>;

/** 구 이름 (서울 25개) */
export type Sigungu = (typeof SIGUNGU_BY_CODE)[keyof typeof SIGUNGU_BY_CODE];

/** 구별 데이터 기준일 (YYYY-MM-DD). 구 이름을 열쇠로 쓴다 */
export type BaseDates = Record<string, string>;

/**
 * 정리된 필지 한 건.
 * 원본에 값이 없거나 "지정되지않음"·0 같은 "값 없음"이면 null로 둔다 (PRD must ① 규칙 8: 추측해서 채우지 않음).
 */
export interface Parcel {
  /** 필지 고유번호 (19자리) — 원본 A1 */
  pnu: string;
  /** 소속 구 — 고유번호 앞 5자리로 정함 */
  sigungu: Sigungu;
  /** 법정동까지의 주소 (예: "서울특별시 영등포구 영등포동") — 원본 A3 */
  address: string;
  /** 지번 (예: "173-2", 산이면 "산 12") — 원본 A5(특수지구분) + A6(지번) */
  jibun: string;
  /** 지목 (예: "대") — 원본 A11 */
  landCategory: string | null;
  /** 토지면적 ㎡ (예: 215) — 원본 A12, 0 이하는 null */
  area: number | null;
  /** 주된 용도지역 (예: "준주거지역") — 원본 A14, 선별 판정 기준 */
  zone1: string | null;
  /** 두 번째 용도지역 (걸쳐 있을 때만) — 원본 A16, 선별 근거에만 표시 */
  zone2: string | null;
  /**
   * 소유구분 목록 (예: ["국유지"], 공유 지분이면 ["국유지","개인"]) — 토지소유정보에서 가져옴.
   * null이면 소유정보에 없는 필지, 값이 없는 것(undefined)도 같은 뜻이다.
   */
  owners?: string[] | null;
  /** 국유지의 국가기관구분 (예: "중앙부처", "지자체"). 구분이 없으면 null */
  ownerAgency?: string | null;
  /** 토지이용상황 (예: "단독", "상업용", "도로등") — 원본 A18. 값이 없으면 null */
  landUse?: string | null;
  /** 지형형상 (예: "부정형", "정방형") — 원본 A22. "지정되지않음"·빈 값이면 null */
  landShape?: string | null;
}

/** 정리 파일의 부가 정보 */
export interface ParcelMeta {
  /** 구별 원본 데이터 기준일 (YYYY-MM-DD) — 원본 A26. 엑셀·화면 상단에 표시 (PRD must ② 규칙 3) */
  baseDates: BaseDates;
  /** 정리 스크립트를 실행한 시각 (ISO 형식) */
  generatedAt: string;
}

/** data/parcels.json 전체 모양 */
export interface ParcelData {
  meta: ParcelMeta;
  parcels: Parcel[];
}

/**
 * 선별 조건 (PLAN 작업 5)
 * Design Ref: §4.2 — 세 조건을 모두 만족하는 필지가 후보
 */
export interface Conditions {
  /** 최소 면적 ㎡ (이 값 이상) */
  minArea: number;
  /** 최대 면적 ㎡ (이 값 이하, 같은 값 포함). 없으면 상한 없음 */
  maxArea?: number;
  /** 허용 지목 (이 중 하나) */
  landCategories: string[];
  /** 허용 용도지역 (주된 용도지역이 이 중 하나) */
  zones: string[];
  /** 허용 소유구분 (필지 소유구분 중 하나라도 이 중에 있으면 해당). 없거나 비어 있으면 소유구분은 보지 않는다 */
  owners?: string[];
  /** 허용 구 (예: ["강남구","서초구"]). 없거나 비어 있으면 서울 전체 */
  districts?: string[];
  /** 제외할 땅모양(지형형상, 예: ["부정형"]). 없거나 비어 있으면 땅모양은 따지지 않는다 */
  excludeShapes?: string[];
}

/** 비어 있을 수 있는 판정 항목 이름 */
export type MissingField = "지목" | "면적" | "용도지역" | "소유구분" | "지형형상";

/** 필지 한 건에 대한 판정 결과 */
export type Judgement =
  | { result: "match" } // 알려진 값이 모두 있고 모두 조건에 맞음 → 후보
  | { result: "exclude" } // 알려진 값 중 하나라도 조건에 안 맞음 → 제외
  | { result: "unknown"; missing: MissingField[] }; // 알려진 값은 맞지만 빈 값이 있음 → 확인 필요

/**
 * "확인 필요" 필지 한 건 (PLAN 작업 6)
 * Design Ref: §3.4 — 엑셀 "확인 필요" 시트의 "비어 있는 항목" 열에 쓰인다
 */
export interface NeedsCheckItem {
  parcel: Parcel;
  /** 비어 있는 항목 (예: ["면적"]) */
  missing: MissingField[];
}

/**
 * 후보 필지 한 건 = 필지 + 선별 근거 (PLAN 작업 7)
 * Design Ref: §4.3 — 근거 예: "면적 1,523㎡(≥1,000) · 지목 대 · 준주거지역"
 */
export interface Candidate extends Parcel {
  /** 어떤 조건에 맞아 선별되었는지 1줄 (PRD must ① 규칙 6) */
  reason: string;
}

/** 말로 입력하는 문장의 최대 글자 수 (비용 보호 — 화면과 서버가 같은 값을 쓴다) */
export const MAX_TEXT_LENGTH = 200;

/** 화면에 한 번에 보내는 최대 건수 (Design Ref: §5 — Vercel 응답 크기 한도 대비). 전체는 엑셀로 받는다 */
export const MAX_DISPLAY_ROWS = 500;

/** POST /api/select 응답 (Design Ref: §5) */
export interface SelectResponse {
  /** 후보 전체 건수 */
  candidateTotal: number;
  /** 확인 필요 전체 건수 */
  needsCheckTotal: number;
  /** 화면에 보여줄 후보 (면적 큰 순, 최대 MAX_DISPLAY_ROWS건) */
  candidates: Candidate[];
  /** 화면에 보여줄 확인 필요 (최대 MAX_DISPLAY_ROWS건) */
  needsCheck: NeedsCheckItem[];
  /** 위 두 목록이 전체보다 잘렸는지 */
  truncated: boolean;
  /** 실제로 적용한 조건 (중복 제거 후) */
  conditions: Conditions;
  /** 구별 원본 데이터 기준일 */
  baseDates: BaseDates;
}

/** 조건 항목 이름 (문장에서 말하지 않아 기본값을 쓴 항목을 알릴 때 쓴다) */
export type ConditionKey = keyof Conditions;

/**
 * POST /api/parse-condition 응답 (Design Ref: §5.1)
 *  - ok: 조건으로 바꿨음. 말하지 않은 항목은 기본값(defaulted)
 *  - need_clarification: 숫자가 없는 애매한 표현 등 — 추측하지 않고 되묻는 안내
 *  - unsupported: 지원하지 않는 조건이 들어 있음 — 무시하지 않고 안내
 */
export type ParseConditionResponse =
  | { status: "ok"; conditions: Conditions; defaulted: ConditionKey[]; message: string }
  | { status: "need_clarification" | "unsupported"; message: string };

/** 오류 코드 (Design Ref: §7 오류 코드 목록) */
export type ApiErrorCode =
  | "INVALID_CONDITIONS"
  | "TEXT_TOO_LONG"
  | "AI_UNAVAILABLE"
  | "AI_BAD_RESPONSE"
  | "INVALID_QUERY" // 주소 검색어를 해석하지 못함
  | "DB_UNAVAILABLE" // 데이터베이스에 연결하지 못함
  | "TOO_MANY_RESULTS"; // 조건이 너무 넓어 결과가 상한을 넘음

/** 오류 응답 모양 (Design Ref: §7) */
export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}

/** POST /api/lookup 응답 — 주소로 찾은 필지 (선별 조건과 상관없이 필지 정보를 그대로 보여준다) */
export interface LookupResponse {
  /** 찾은 필지 (최대 LOOKUP_LIMIT건) */
  parcels: Parcel[];
  /** 더 있는데 잘렸는지 */
  truncated: boolean;
}

/** 주소 검색 결과를 한 번에 보여주는 최대 건수 */
export const LOOKUP_LIMIT = 10;

/** 선별 결과 — 후보와 확인 필요를 나눠 담는다 (PRD must ① 규칙 7) */
export interface SelectionResult {
  /** 조건을 모두 만족하는 후보 (면적 큰 순), 근거 포함 */
  candidates: Candidate[];
  /** 알려진 값은 맞지만 빈 값이 있어 판정할 수 없는 필지 */
  needsCheck: NeedsCheckItem[];
}
