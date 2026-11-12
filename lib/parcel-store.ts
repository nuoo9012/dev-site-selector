// 필지 데이터 읽기 (데이터베이스) — 서버 쪽 전용
// Design Ref: 서울 확장 — 필지 약 86만 건은 코드에 묶지 않고 데이터베이스에 두고, 조건에 맞을 수 있는 필지만 가져온다.
// 판정은 여전히 lib/selection.ts가 한다. 여기서는 "제외가 확실한 필지"만 미리 걸러서 가져온다.

import "server-only";
import { DbError, getPool } from "./db";
import type { BaseDates, Conditions, Parcel } from "./types";

/** 조건이 너무 넓어 한 번에 다룰 수 있는 건수를 넘었을 때 */
export class TooManyResultsError extends Error {
  constructor() {
    super("TOO_MANY_RESULTS");
    this.name = "TooManyResultsError";
  }
}

/** 한 번에 가져올 수 있는 최대 건수 (이보다 많으면 조건을 좁혀 달라고 안내). 서버 메모리·시간 보호 */
export const MAX_FETCH_ROWS = 200_000;

interface Row {
  pnu: string;
  sigungu: string;
  address: string;
  jibun: string;
  land_category: string | null;
  area: number | null;
  zone1: string | null;
  zone2: string | null;
  owners: string[] | null;
  owner_agency: string | null;
  land_use: string | null;
  land_shape: string | null;
}

const toParcel = (r: Row): Parcel => ({
  pnu: r.pnu,
  sigungu: r.sigungu as Parcel["sigungu"],
  address: r.address,
  jibun: r.jibun,
  landCategory: r.land_category,
  area: r.area,
  zone1: r.zone1,
  zone2: r.zone2,
  owners: r.owners,
  ownerAgency: r.owner_agency,
  landUse: r.land_use,
  landShape: r.land_shape,
});

/** 접속 실패 등 DB 문제는 원래 내용을 숨기고 DbError로 바꾼다 */
function logAndWrap(error: unknown): never {
  if (error instanceof TooManyResultsError || error instanceof DbError) throw error;
  console.error(`[db] 조회 실패: ${(error as NodeJS.ErrnoException)?.code ?? (error as Error)?.name ?? "알 수 없음"}`);
  throw new DbError("DB_UNAVAILABLE");
}

/**
 * 조건에 "맞거나, 맞는지 알 수 없는" 필지를 가져온다 (= 후보 + 확인 필요). 정렬은 selection.ts가 하므로 DB에서는 하지 않는다.
 * 알려진 값 중 하나라도 조건에 안 맞는 필지는 제외가 확실하므로 가져오지 않는다. (selection.ts 판정 규칙 1과 같음)
 * 값은 모두 변수(파라미터)로 넘겨서, 입력 값이 SQL 문장으로 해석되지 않는다.
 */
export async function findParcels(conditions: Conditions): Promise<Parcel[]> {
  try {
    const result = await getPool().query<Row>(
      `select pnu, sigungu, address, jibun, land_category, area, zone1, zone2, owners, owner_agency, land_use, land_shape
         from parcels
        where (land_category is null or land_category = any($1::text[]))
          and (area is null or area >= $2)
          and (area is null or $8::float8 is null or area <= $8::float8)
          and (zone1 is null or zone1 = any($3::text[]))
          and (cardinality($5::text[]) = 0 or owners is null or owners && $5::text[])
          and (cardinality($6::text[]) = 0 or sigungu = any($6::text[]))
          and (cardinality($7::text[]) = 0 or land_shape is null or not (land_shape = any($7::text[])))
        limit $4`,
      [conditions.landCategories, conditions.minArea, conditions.zones, MAX_FETCH_ROWS + 1, conditions.owners ?? [], conditions.districts ?? [], conditions.excludeShapes ?? [], conditions.maxArea ?? null],
    );
    if (result.rows.length > MAX_FETCH_ROWS) throw new TooManyResultsError();
    return result.rows.map(toParcel);
  } catch (error) {
    return logAndWrap(error);
  }
}

export interface ParcelSummary {
  /** 구별 원본 데이터 기준일 */
  baseDates: BaseDates;
  /** 구별 필지 수 */
  counts: Record<string, number>;
  /** 전체 필지 수 */
  total: number;
  /** 소유정보(토지소유정보)의 기준일. 아직 올리지 않았으면 null */
  ownerBaseDate: string | null;
}

// 기준일·건수는 자주 바뀌지 않으므로 서버 메모리에 10분 동안 둔다
let cached: { at: number; value: ParcelSummary } | undefined;
const CACHE_MS = 10 * 60 * 1000;

/** 구별 기준일과 필지 수 */
export async function getSummary(): Promise<ParcelSummary> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  try {
    const result = await getPool().query<{ sigungu: string; base_date: string; parcel_count: number }>(
      `select sigungu, to_char(base_date, 'YYYY-MM-DD') as base_date, parcel_count from parcel_meta order by sigungu`,
    );
    const baseDates: BaseDates = {};
    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of result.rows) {
      baseDates[row.sigungu] = row.base_date;
      counts[row.sigungu] = row.parcel_count;
      total += row.parcel_count;
    }
    const owner = await getPool().query<{ base_date: string }>(
      `select to_char(base_date, 'YYYY-MM-DD') as base_date from source_meta where name = 'owners'`,
    );
    cached = { at: Date.now(), value: { baseDates, counts, total, ownerBaseDate: owner.rows[0]?.base_date ?? null } };
    return cached.value;
  } catch (error) {
    return logAndWrap(error);
  }
}
