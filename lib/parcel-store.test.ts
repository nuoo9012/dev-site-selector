// 필지 저장소(lib/parcel-store.ts) 자동 검사 — 실제 데이터베이스에 연결하지 않고, 접속 묶음(pool)을 가짜로 바꿔 확인한다.
// 확인하는 것: 값이 SQL 문장에 섞이지 않고 변수로 넘어가는지, 건수 상한, 오류 처리(내부 내용 숨김), 요약 값 만들기.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONDITIONS } from "./conditions";

const query = vi.fn();
vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return { ...original, getPool: () => ({ query }) };
});

import { DbError } from "./db";
import { findByAddress, findParcels, getSummary, MAX_FETCH_ROWS, TooManyResultsError } from "./parcel-store";

const row = (n: number) => ({
  pnu: `1156010100100${String(n).padStart(6, "0")}`,
  sigungu: "영등포구",
  address: "서울특별시 영등포구 테스트동",
  jibun: String(n),
  land_category: "대",
  area: 1500,
  zone1: "준주거지역",
  zone2: null,
  owners: null,
  owner_agency: null,
  land_use: null,
  land_shape: null,
});

beforeEach(() => {
  query.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("findParcels", () => {
  it("값은 변수로 넘기고 SQL 문장에는 섞지 않음 (SQL 삽입 방지)", async () => {
    query.mockResolvedValueOnce({ rows: [row(1)] });
    const evil = { minArea: 1000, landCategories: ["대'; drop table parcels; --"], zones: ["준주거지역"] };
    await findParcels(evil);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain("drop table");
    expect(sql).toMatch(/\$1/);
    expect(params[0]).toEqual(evil.landCategories);
    expect(params[1]).toBe(1000);
    expect(params[2]).toEqual(evil.zones);
  });

  it("알려진 값이 안 맞는 필지만 거르고, 빈 값(null)은 남기는 조건으로 묻는다", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await findParcels(DEFAULT_CONDITIONS);
    const sql = (query.mock.calls[0] as [string])[0];
    expect(sql).toMatch(/land_category is null or land_category = any/);
    expect(sql).toMatch(/area is null or area >= /);
    expect(sql).toMatch(/zone1 is null or zone1 = any/);
  });

  it("DB의 열 이름을 앱의 필지 모양으로 바꿈", async () => {
    query.mockResolvedValueOnce({ rows: [row(7)] });
    const [parcel] = await findParcels(DEFAULT_CONDITIONS);
    expect(parcel).toEqual({
      pnu: row(7).pnu,
      sigungu: "영등포구",
      address: "서울특별시 영등포구 테스트동",
      jibun: "7",
      landCategory: "대",
      area: 1500,
      zone1: "준주거지역",
      zone2: null,
      owners: null,
      ownerAgency: null,
      landUse: null,
      landShape: null,
    });
  });

  it("소유구분 조건은 변수로 넘기고, 빈 목록이면 소유구분을 따지지 않는 값으로 보냄", async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await findParcels({ ...DEFAULT_CONDITIONS, owners: ["국유지"] });
    await findParcels(DEFAULT_CONDITIONS);
    const [sql, withOwner] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("owners is null or owners && $5");
    expect(withOwner[4]).toEqual(["국유지"]);
    expect(withOwner[5]).toEqual([]); // 지역을 고르지 않으면 서울 전체
    expect((query.mock.calls[1] as [string, unknown[]])[1][4]).toEqual([]);
  });

  it("지역(구) 조건도 변수로 넘김", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await findParcels({ ...DEFAULT_CONDITIONS, districts: ["강남구", "서초구"] });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("sigungu = any($6::text[])");
    expect(params[5]).toEqual(["강남구", "서초구"]);
  });

  it("제외할 땅모양은 변수로 넘기고, 모양을 모르는 필지(null)는 빼지 않고 가져옴", async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await findParcels({ ...DEFAULT_CONDITIONS, excludeShapes: ["부정형"] });
    await findParcels(DEFAULT_CONDITIONS);
    const [sql, withShape] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("land_shape is null or not (land_shape = any($7::text[]))");
    expect(withShape[6]).toEqual(["부정형"]);
    expect((query.mock.calls[1] as [string, unknown[]])[1][6]).toEqual([]);
  });

  it("최대 면적은 변수로 넘기고, 없으면 null을 보내 상한을 걸지 않음", async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await findParcels({ ...DEFAULT_CONDITIONS, maxArea: 5000 });
    await findParcels(DEFAULT_CONDITIONS);
    const [sql, withMax] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("area is null or $8::float8 is null or area <= $8::float8");
    expect(withMax[7]).toBe(5000);
    expect((query.mock.calls[1] as [string, unknown[]])[1][7]).toBeNull();
  });

  it("DB의 토지이용상황·지형형상이 필지에 담김", async () => {
    query.mockResolvedValueOnce({ rows: [{ ...row(4), land_use: "상업용", land_shape: "정방형" }] });
    const [parcel] = await findParcels(DEFAULT_CONDITIONS);
    expect(parcel.landUse).toBe("상업용");
    expect(parcel.landShape).toBe("정방형");
  });

  it("DB의 소유구분·국가기관이 필지에 담김", async () => {
    query.mockResolvedValueOnce({ rows: [{ ...row(3), owners: ["국유지", "개인"], owner_agency: "중앙부처" }] });
    const [parcel] = await findParcels(DEFAULT_CONDITIONS);
    expect(parcel.owners).toEqual(["국유지", "개인"]);
    expect(parcel.ownerAgency).toBe("중앙부처");
  });

  it("결과가 상한을 넘으면 TooManyResultsError", async () => {
    query.mockResolvedValueOnce({ rows: Array.from({ length: MAX_FETCH_ROWS + 1 }, (_, i) => row(i)) });
    await expect(findParcels(DEFAULT_CONDITIONS)).rejects.toBeInstanceOf(TooManyResultsError);
  });

  it("상한 + 1건까지만 요청함", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await findParcels(DEFAULT_CONDITIONS);
    expect((query.mock.calls[0] as [string, unknown[]])[1][3]).toBe(MAX_FETCH_ROWS + 1);
  });

  it("DB 오류는 DbError로 바꾸고, 접속 주소·원래 내용은 로그에 남기지 않음", async () => {
    query.mockRejectedValueOnce(Object.assign(new Error("password authentication failed for postgresql://u:SECRET@h/db"), { code: "28P01" }));
    await expect(findParcels(DEFAULT_CONDITIONS)).rejects.toBeInstanceOf(DbError);
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("28P01");
    expect(logged).not.toContain("SECRET");
  });
});

describe("getSummary", () => {
  it("구별 기준일·건수·전체 건수·소유정보 기준일을 만든다 (그리고 잠시 기억해 두 번째는 DB를 부르지 않음)", async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          { sigungu: "도봉구", base_date: "2026-05-20", parcel_count: 22000 },
          { sigungu: "영등포구", base_date: "2026-05-20", parcel_count: 37000 },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ base_date: "2026-10-28" }] });
    const first = await getSummary();
    expect(first).toEqual({
      baseDates: { 도봉구: "2026-05-20", 영등포구: "2026-05-20" },
      counts: { 도봉구: 22000, 영등포구: 37000 },
      total: 59000,
      ownerBaseDate: "2026-10-28",
    });
    expect(await getSummary()).toBe(first);
    expect(query).toHaveBeenCalledTimes(2);
  });
});

describe("findByAddress (주소로 필지 찾기)", () => {
  it("지번과 주소 조각을 변수로 넘기고(SQL에 섞지 않음) 한 건 더 요청한다", async () => {
    query.mockResolvedValueOnce({ rows: [row(913)] });
    await findByAddress({ patterns: ["%송파구%", "%가락동%"], jibun: "913" }, 10);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("replace(jibun, ' ', '') = $1");
    expect(sql).toContain("address ilike all($2::text[])");
    expect(sql).not.toContain("송파구");
    expect(params).toEqual(["913", ["%송파구%", "%가락동%"], 11]);
  });

  it("결과를 필지 모양으로 바꿔 주고, 상한 이하면 truncated가 아님", async () => {
    query.mockResolvedValueOnce({ rows: [{ ...row(913), land_use: "아파트", land_shape: "가로장방" }] });
    const r = await findByAddress({ patterns: ["%가락동%"], jibun: "913" }, 10);
    expect(r.truncated).toBe(false);
    expect(r.parcels).toHaveLength(1);
    expect(r.parcels[0].landUse).toBe("아파트");
  });

  it("상한보다 많이 찾으면 상한까지만 돌려주고 truncated", async () => {
    query.mockResolvedValueOnce({ rows: Array.from({ length: 11 }, (_, i) => row(i)) });
    const r = await findByAddress({ patterns: ["%동%"], jibun: "1" }, 10);
    expect(r.parcels).toHaveLength(10);
    expect(r.truncated).toBe(true);
  });

  it("DB 오류는 DbError로 바꾼다", async () => {
    query.mockRejectedValueOnce(new Error("boom"));
    await expect(findByAddress({ patterns: ["%동%"], jibun: "1" }, 10)).rejects.toBeInstanceOf(DbError);
  });
});
