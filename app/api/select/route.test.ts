// /api/select 자동 검사 (PLAN 작업 9) — 서버를 띄우지 않고 요청을 직접 넣어 본다
// Design Ref: §10.3 API 검사 #1·#2·#6 — 기본 조건, 잘못된 조건, 화면용 500건 제한

import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONDITIONS } from "@/lib/conditions";
import { DbError } from "@/lib/db";
import { findParcels, TooManyResultsError } from "@/lib/parcel-store";
import { PARCEL_DATA } from "@/lib/parcels";
import { selectParcels } from "@/lib/selection";
import { MAX_DISPLAY_ROWS, type Conditions, type SelectResponse } from "@/lib/types";
import { POST } from "./route";

// 데이터베이스 대신 시험용으로 data/parcels.json(영등포·도봉 59,504필지)을 쓰는 가짜 저장소.
// 실제 SQL과 같은 규칙(알려진 값이 안 맞으면 제외, 빈 값은 남김)으로 거른다.
vi.mock("@/lib/parcel-store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/parcel-store")>();
  const { PARCEL_DATA } = await import("@/lib/parcels");
  return {
    ...original,
    findParcels: vi.fn(async (c: Conditions) =>
      PARCEL_DATA.parcels.filter(
        (p) =>
          (p.landCategory === null || c.landCategories.includes(p.landCategory)) &&
          (p.area === null || p.area >= c.minArea) &&
          (p.zone1 === null || c.zones.includes(p.zone1)),
      ),
    ),
    getSummary: vi.fn(async () => ({ baseDates: PARCEL_DATA.meta.baseDates, counts: {}, total: PARCEL_DATA.parcels.length })),
  };
});

function post(body: unknown, raw = false): Promise<Response> {
  return POST(
    new Request("http://localhost/api/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );
}

describe("POST /api/select", () => {
  it("기본 조건 → 200, 전체 건수가 선별 계산 결과와 같고 화면에는 500건까지만", async () => {
    const res = await post(DEFAULT_CONDITIONS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SelectResponse;
    const expected = selectParcels(PARCEL_DATA.parcels, DEFAULT_CONDITIONS);
    expect(body.candidateTotal).toBe(expected.candidates.length);
    expect(body.needsCheckTotal).toBe(expected.needsCheck.length);
    expect(body.candidates).toHaveLength(Math.min(expected.candidates.length, MAX_DISPLAY_ROWS));
    expect(body.truncated).toBe(expected.candidates.length > MAX_DISPLAY_ROWS);
    expect(body.baseDates).toEqual(PARCEL_DATA.meta.baseDates);
  });

  it("후보마다 선별 근거가 붙어 있음 (SC-2)", async () => {
    const body = (await (await post(DEFAULT_CONDITIONS)).json()) as SelectResponse;
    expect(body.candidates.every((c) => c.reason.length > 0)).toBe(true);
  });

  it("중복된 조건은 합쳐서 적용하고 적용한 조건을 돌려줌", async () => {
    const body = (await (await post({ minArea: 1000, landCategories: ["대", "대"], zones: ["준주거지역", "준주거지역"] })).json()) as SelectResponse;
    expect(body.conditions).toEqual({ minArea: 1000, landCategories: ["대"], zones: ["준주거지역"] });
  });

  it("조건에 맞는 필지가 없으면 후보 0건", async () => {
    const body = (await (await post({ minArea: 99999999, landCategories: ["대"], zones: ["준주거지역"] })).json()) as SelectResponse;
    expect(body.candidateTotal).toBe(0);
    expect(body.candidates).toEqual([]);
  });

  it("잘못된 조건은 400과 한국어 안내", async () => {
    const res = await post({ ...DEFAULT_CONDITIONS, landCategories: ["대지"] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "INVALID_CONDITIONS", message: "지원하지 않는 지목이에요." } });
  });

  it("JSON이 아닌 요청도 400", async () => {
    const res = await post("hello", true);
    expect(res.status).toBe(400);
  });

  it("조건이 너무 넓어 결과가 상한을 넘으면 400과 안내", async () => {
    vi.mocked(findParcels).mockRejectedValueOnce(new TooManyResultsError());
    const res = await post(DEFAULT_CONDITIONS);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("TOO_MANY_RESULTS");
  });

  it("데이터베이스에 연결하지 못하면 503과 안내 (내부 내용은 담지 않음)", async () => {
    vi.mocked(findParcels).mockRejectedValueOnce(new DbError("DB_UNAVAILABLE"));
    const res = await post(DEFAULT_CONDITIONS);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: { code: "DB_UNAVAILABLE", message: "데이터를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요." } });
  });
});
