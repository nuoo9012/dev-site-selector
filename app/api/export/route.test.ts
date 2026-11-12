// /api/export 자동 검사 (PLAN 작업 12) — 서버를 띄우지 않고 요청을 직접 넣어 본다
// Design Ref: §10.3 API 검사 #7 — 기본 조건 → 200, 엑셀 파일, 시트 2개

import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONDITIONS } from "@/lib/conditions";
import { SHEET_CANDIDATES, SHEET_NEEDS_CHECK } from "@/lib/excel";
import { DbError } from "@/lib/db";
import { findParcels } from "@/lib/parcel-store";
import { PARCEL_DATA } from "@/lib/parcels";
import { selectParcels } from "@/lib/selection";
import type { Conditions } from "@/lib/types";
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
    new Request("http://localhost/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );
}

describe("POST /api/export", () => {
  it("기본 조건 → 200, 엑셀 형식, 한글 파일 이름, 저장하지 않는 응답", async () => {
    const res = await post(DEFAULT_CONDITIONS);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).toMatch(/^attachment; /);
    const encodedName = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1] ?? "";
    expect(decodeURIComponent(encodedName)).toMatch(/^개발대상지_\d{8}\.xlsx$/);
  });

  it("받은 파일을 열면 시트 2개이고, 줄 수가 선별 결과 전체 건수와 같음 (500건 제한 없음)", async () => {
    const res = await post(DEFAULT_CONDITIONS);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await res.arrayBuffer()) as ArrayBuffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual([SHEET_CANDIDATES, SHEET_NEEDS_CHECK]);

    const expected = selectParcels(PARCEL_DATA.parcels, DEFAULT_CONDITIONS);
    expect(wb.getWorksheet(SHEET_CANDIDATES)!.rowCount).toBe(5 + expected.candidates.length);
    expect(wb.getWorksheet(SHEET_NEEDS_CHECK)!.rowCount).toBe(5 + expected.needsCheck.length);
    expect(expected.candidates.length).toBeGreaterThan(500); // 화면 제한(500건)보다 많은 경우를 실제로 확인
  });

  it("같은 조건으로 두 번 받으면 내용이 같음", async () => {
    const read = async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await (await post(DEFAULT_CONDITIONS)).arrayBuffer()) as ArrayBuffer);
      return wb.getWorksheet(SHEET_CANDIDATES)!.getSheetValues();
    };
    expect(await read()).toEqual(await read());
  });

  it("바뀐 조건이 엑셀 상단 조건 줄에 그대로 적힘", async () => {
    const res = await post({ minArea: 2000, landCategories: ["대"], zones: ["준주거지역"] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await res.arrayBuffer()) as ArrayBuffer);
    expect(wb.getWorksheet(SHEET_CANDIDATES)!.getCell("A1").value).toBe("적용 조건: 면적 2,000㎡ 이상 · 지목 대 · 용도지역 준주거지역");
  });

  it("잘못된 조건은 400과 한국어 안내 (엑셀을 만들지 않음)", async () => {
    const res = await post({ ...DEFAULT_CONDITIONS, minArea: -1 });
    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: { code: "INVALID_CONDITIONS", message: "최소 면적은 0 이상이어야 해요." } });
  });

  it("JSON이 아닌 요청도 400", async () => {
    const res = await post("hello", true);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_CONDITIONS");
  });

  it("데이터베이스에 연결하지 못하면 503과 안내 (엑셀을 만들지 않음)", async () => {
    vi.mocked(findParcels).mockRejectedValueOnce(new DbError("DB_UNAVAILABLE"));
    const res = await post(DEFAULT_CONDITIONS);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("DB_UNAVAILABLE");
  });
});
