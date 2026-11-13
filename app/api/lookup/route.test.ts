// /api/lookup 자동 검사 — 서버를 띄우지 않고 요청을 직접 넣어 본다 (DB는 가짜 저장소로 바꿈)

import { describe, expect, it, vi } from "vitest";
import { DbError } from "@/lib/db";
import { findByAddress } from "@/lib/parcel-store";
import type { LookupResponse, Parcel } from "@/lib/types";
import { POST } from "./route";

const parcel: Parcel = {
  pnu: "1171010100109130000",
  sigungu: "송파구",
  address: "서울특별시 송파구 가락동",
  jibun: "913",
  landCategory: "대",
  area: 346570.4,
  zone1: "제3종일반주거지역",
  zone2: null,
  owners: ["개인", "국유지"],
  ownerAgency: null,
  landUse: "아파트",
  landShape: "가로장방",
};

vi.mock("@/lib/parcel-store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/parcel-store")>();
  return { ...original, findByAddress: vi.fn(async () => ({ parcels: [parcel], truncated: false })) };
});

function post(body: unknown, raw = false): Promise<Response> {
  return POST(
    new Request("http://localhost/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );
}

describe("POST /api/lookup", () => {
  it("지번 주소 → 200, 찾은 필지의 모든 정보", async () => {
    const res = await post({ query: "송파구 가락동 913" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as LookupResponse;
    expect(body.parcels).toEqual([parcel]);
    expect(body.truncated).toBe(false);
  });

  it("검색어를 해석해서 (주소 조각, 지번)을 저장소에 넘긴다", async () => {
    await post({ query: "서울특별시 송파구 가락동 913" });
    expect(vi.mocked(findByAddress)).toHaveBeenLastCalledWith({ ok: true, patterns: ["%송파구%", "%가락동%"], jibun: "913" }, 10);
  });

  it("지번이 없는 검색어는 400과 안내 (DB를 부르지 않음)", async () => {
    vi.mocked(findByAddress).mockClear();
    const res = await post({ query: "송파구 가락동" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_QUERY");
    expect(body.error.message).toContain("지번까지");
    expect(findByAddress).not.toHaveBeenCalled();
  });

  it("검색어가 없거나 글자가 아니거나 JSON이 아니어도 400", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ query: 123 })).status).toBe(400);
    expect((await post("hello", true)).status).toBe(400);
  });

  it("데이터베이스에 연결하지 못하면 503과 안내 (내부 내용은 담지 않음)", async () => {
    vi.mocked(findByAddress).mockRejectedValueOnce(new DbError("DB_UNAVAILABLE"));
    const res = await post({ query: "송파구 가락동 913" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "DB_UNAVAILABLE", message: "데이터를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요." } });
  });
});
