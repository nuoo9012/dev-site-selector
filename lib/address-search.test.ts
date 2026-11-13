// 주소 검색어 해석 자동 검사 — 지번 주소를 올바르게 나누고, 이상한 입력이 검색 범위를 넓히지 못하는지 확인한다.

import { describe, expect, it } from "vitest";
import { MAX_ADDRESS_QUERY_LENGTH, parseAddressQuery } from "./address-search";

describe("parseAddressQuery — 정상", () => {
  it("'송파구 가락동 913' → 구·동 조각과 지번", () => {
    expect(parseAddressQuery("송파구 가락동 913")).toEqual({ ok: true, patterns: ["%송파구%", "%가락동%"], jibun: "913" });
  });

  it("'서울특별시/서울시/서울'은 무시한다", () => {
    expect(parseAddressQuery("서울특별시 송파구 가락동 913")).toEqual({ ok: true, patterns: ["%송파구%", "%가락동%"], jibun: "913" });
    expect(parseAddressQuery("서울 송파구 가락동 913")).toEqual({ ok: true, patterns: ["%송파구%", "%가락동%"], jibun: "913" });
  });

  it("부번(-)과 '번지'를 지원한다", () => {
    expect(parseAddressQuery("영등포구 여의도동 50-1번지")).toEqual({ ok: true, patterns: ["%영등포구%", "%여의도동%"], jibun: "50-1" });
  });

  it("산 번지는 공백 없이 '산89-2'로 정리한다 (공백 유무와 상관없이)", () => {
    expect(parseAddressQuery("도봉구 방학동 산 89-2")).toEqual({ ok: true, patterns: ["%도봉구%", "%방학동%"], jibun: "산89-2" });
    expect(parseAddressQuery("도봉구 방학동 산89-2")).toEqual({ ok: true, patterns: ["%도봉구%", "%방학동%"], jibun: "산89-2" });
  });

  it("구 없이 동 이름과 지번만 써도 된다", () => {
    expect(parseAddressQuery("가락동 913")).toEqual({ ok: true, patterns: ["%가락동%"], jibun: "913" });
  });

  it("동 이름에 숫자가 들어 있어도(을지로1가) 맨 끝 숫자만 지번으로 본다", () => {
    expect(parseAddressQuery("중구 을지로1가 50")).toEqual({ ok: true, patterns: ["%중구%", "%을지로1가%"], jibun: "50" });
  });

  it("쉼표·여러 칸 공백·앞의 0을 정리한다", () => {
    expect(parseAddressQuery("  송파구,  가락동   0913 ")).toEqual({ ok: true, patterns: ["%송파구%", "%가락동%"], jibun: "913" });
  });
});

describe("parseAddressQuery — 안내가 필요한 입력", () => {
  it("지번이 없으면 안내", () => {
    const r = parseAddressQuery("송파구 가락동");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("지번까지");
  });

  it("동 이름이 없으면 안내", () => {
    const r = parseAddressQuery("서울특별시 913");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("동 이름까지");
  });

  it("글자가 아니거나 비었거나 너무 길면 거절", () => {
    expect(parseAddressQuery(123).ok).toBe(false);
    expect(parseAddressQuery(null).ok).toBe(false);
    expect(parseAddressQuery("   ").ok).toBe(false);
    expect(parseAddressQuery("가".repeat(MAX_ADDRESS_QUERY_LENGTH + 1) + " 1").ok).toBe(false);
  });
});

describe("parseAddressQuery — 검색 범위를 넓히려는 입력", () => {
  it("LIKE 특수 글자(%, _, \\)는 지워서 조각에 남지 않는다", () => {
    const r = parseAddressQuery("송%파_구 가\\락동 913");
    expect(r).toEqual({ ok: true, patterns: ["%송파구%", "%가락동%"], jibun: "913" });
  });

  it("조각이 전부 특수 글자뿐이면 동 이름이 없는 것으로 보고 안내", () => {
    expect(parseAddressQuery("%%% ___ 913").ok).toBe(false);
  });

  it("SQL 조각 같은 글자도 허용 글자만 남아 그냥 검색어가 된다", () => {
    const r = parseAddressQuery("송파구'; drop table parcels; -- 913");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patterns.every((p) => /^%[가-힣A-Za-z0-9·-]+%$/.test(p))).toBe(true);
  });
});
