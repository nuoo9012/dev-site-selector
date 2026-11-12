// 네이버지도 링크 자동 검사 — 주소와 지번이 올바르게 들어가고, 이상한 글자가 주소를 망가뜨리지 않는지 확인한다.

import { describe, expect, it } from "vitest";
import { naverMapUrl } from "./map-link";

describe("naverMapUrl", () => {
  it("주소와 지번을 이어 네이버지도 검색 주소를 만든다", () => {
    expect(naverMapUrl("서울특별시 송파구 가락동", "913")).toBe(`https://map.naver.com/p/search/${encodeURIComponent("서울특별시 송파구 가락동 913")}`);
  });

  it("산 번지와 부번(하이픈)도 그대로 들어간다", () => {
    const url = naverMapUrl("서울특별시 도봉구 방학동", "산 89-2");
    expect(decodeURIComponent(url.replace("https://map.naver.com/p/search/", ""))).toBe("서울특별시 도봉구 방학동 산 89-2");
  });

  it("여러 칸 띄어쓰기는 한 칸으로 줄이고 앞뒤 공백은 지운다", () => {
    const url = naverMapUrl("  서울특별시   중구  을지로1가 ", " 50 ");
    expect(decodeURIComponent(url.replace("https://map.naver.com/p/search/", ""))).toBe("서울특별시 중구 을지로1가 50");
  });

  it("주소에 슬래시·물음표·샵 같은 글자가 있어도 주소 구조를 바꾸지 못한다 (모두 변환됨)", () => {
    const url = naverMapUrl("서울/특별시?x=1#", "9");
    const path = url.slice("https://map.naver.com/p/search/".length);
    expect(path).not.toMatch(/[/?#]/);
    expect(url.startsWith("https://map.naver.com/p/search/")).toBe(true);
  });
});
