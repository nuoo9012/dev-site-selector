// 공시지가·토지가액 계산과 표시 자동 검사 — 계산이 맞는지, 값이 없을 때 추측하지 않는지 확인한다.

import { describe, expect, it } from "vitest";
import { formatWon, formatWonApprox, landValue } from "./land-value";

describe("landValue — 토지가액 = 공시지가 × 면적", () => {
  it("공시지가 × 면적, 원 단위로 반올림", () => {
    expect(landValue({ landPrice: 884000, area: 2 })).toBe(1_768_000);
    expect(landValue({ landPrice: 1_000_000, area: 1523.4 })).toBe(1_523_400_000);
    expect(landValue({ landPrice: 333, area: 0.5 })).toBe(167); // 166.5 → 반올림
  });

  it("큰 필지(수천억 원)도 정확히 계산한다", () => {
    expect(landValue({ landPrice: 9_000_000, area: 346570.4 })).toBe(3_119_133_600_000);
  });

  it("공시지가나 면적이 없으면 null — 추측해서 채우지 않는다", () => {
    expect(landValue({ landPrice: null, area: 100 })).toBeNull();
    expect(landValue({ landPrice: 884000, area: null })).toBeNull();
    expect(landValue({ area: 100 })).toBeNull(); // landPrice 값 자체가 없는 필지
    expect(landValue({ landPrice: undefined, area: undefined })).toBeNull();
  });
});

describe("formatWon / formatWonApprox", () => {
  it("쉼표와 '원'을 붙인다. 값이 없으면 null", () => {
    expect(formatWon(884000)).toBe("884,000원");
    expect(formatWon(null)).toBeNull();
    expect(formatWon(undefined)).toBeNull();
  });

  it("큰 금액은 조·억·만 원으로 줄인 어림값을 준다", () => {
    expect(formatWonApprox(3_119_133_600_000)).toBe("약 3.1조 원");
    expect(formatWonApprox(1_523_400_000)).toBe("약 15.2억 원");
    expect(formatWonApprox(25_300_000_000)).toBe("약 253억 원");
    expect(formatWonApprox(88_400_000)).toBe("약 8,840만 원");
  });

  it("1만 원 미만과 값 없음은 어림값이 없다", () => {
    expect(formatWonApprox(9_999)).toBeNull();
    expect(formatWonApprox(null)).toBeNull();
  });
});
