// 선별 조건 값 검사 (PLAN 작업 9)
// Design Ref: §5.1, §8 — 면적은 0 이상 숫자, 지목·용도지역은 정해진 목록 안의 이름만 허용
// 서버 쪽 코드(API)에서 쓴다. 화면에서 가볍게 쓰는 기본 조건은 conditions.ts에 따로 둔다.

import { z } from "zod";
import { DISTRICTS, LAND_CATEGORIES, LAND_SHAPES, OWNER_CATEGORIES, ZONES } from "./conditions";
import type { Conditions } from "./types";

// 면적 상한: 이 값을 넘는 조건은 실수로 보고 거절한다 (영등포·도봉 최대 필지보다 훨씬 큼)
const MAX_AREA = 100_000_000;

export const conditionsSchema = z.object(
  {
    minArea: z
      .number("최소 면적은 숫자여야 해요.")
      .finite("최소 면적은 숫자여야 해요.")
      .min(0, "최소 면적은 0 이상이어야 해요.")
      .max(MAX_AREA, `최소 면적은 ${MAX_AREA.toLocaleString("ko-KR")}㎡ 이하여야 해요.`),
    landCategories: z
      .array(z.enum(LAND_CATEGORIES, "지원하지 않는 지목이에요."), "지목은 목록으로 보내 주세요.")
      .min(1, "지목을 하나 이상 골라 주세요.")
      .max(LAND_CATEGORIES.length * 2, "지목이 너무 많아요."), // 중복 포함 상한: 큰 요청으로 서버를 낭비시키지 못하게
    zones: z
      .array(z.enum(ZONES, "지원하지 않는 용도지역이에요."), "용도지역은 목록으로 보내 주세요.")
      .min(1, "용도지역을 하나 이상 골라 주세요.")
      .max(ZONES.length * 2, "용도지역이 너무 많아요."),
    // 소유구분은 선택 사항이다. 없거나 비어 있으면 소유구분은 따지지 않는다.
    owners: z
      .array(z.enum(OWNER_CATEGORIES, "지원하지 않는 소유구분이에요."), "소유구분은 목록으로 보내 주세요.")
      .max(OWNER_CATEGORIES.length * 2, "소유구분이 너무 많아요.")
      .optional(),
    // 지역(구)은 선택 사항이다. 없거나 비어 있으면 서울 전체.
    districts: z
      .array(z.enum(DISTRICTS, "지원하지 않는 지역이에요. 서울 25개 구 중에서 골라 주세요."), "지역은 목록으로 보내 주세요.")
      .max(DISTRICTS.length * 2, "지역이 너무 많아요.")
      .optional(),
    // 제외할 땅모양은 선택 사항이다. 없거나 비어 있으면 땅모양은 따지지 않는다.
    excludeShapes: z
      .array(z.enum(LAND_SHAPES, "지원하지 않는 땅모양이에요."), "땅모양은 목록으로 보내 주세요.")
      .max(LAND_SHAPES.length * 2, "땅모양이 너무 많아요.")
      .optional(),
  },
  "조건은 { minArea, landCategories, zones } 모양으로 보내 주세요.",
);

export type ConditionsValidation =
  | { ok: true; conditions: Conditions }
  | { ok: false; message: string };

/**
 * 밖에서 들어온 값을 조건으로 검사한다.
 * 통과하면 중복을 없앤 조건을, 실패하면 사람이 읽을 수 있는 한국어 안내를 돌려준다.
 */
export function validateConditions(input: unknown): ConditionsValidation {
  const parsed = conditionsSchema.safeParse(input);
  if (!parsed.success) {
    // 같은 안내가 여러 번 나오지 않게 중복을 없애고 처음 3개만 보여준다
    const messages = [...new Set(parsed.error.issues.map((issue) => issue.message))].slice(0, 3);
    return { ok: false, message: messages.join(" ") };
  }
  const { minArea, landCategories, zones, owners, districts, excludeShapes } = parsed.data;
  const uniqueShapes = excludeShapes ? [...new Set(excludeShapes)] : [];
  const uniqueOwners = owners ? [...new Set(owners)] : [];
  const uniqueDistricts = districts ? [...new Set(districts)] : [];
  return {
    ok: true,
    conditions: {
      minArea,
      landCategories: [...new Set(landCategories)],
      zones: [...new Set(zones)],
      // 소유구분을 고르지 않았으면 이 항목을 아예 넣지 않는다 (이전과 같은 모양 유지)
      ...(uniqueOwners.length > 0 ? { owners: uniqueOwners } : {}),
      ...(uniqueDistricts.length > 0 ? { districts: uniqueDistricts } : {}),
      ...(uniqueShapes.length > 0 ? { excludeShapes: uniqueShapes } : {}),
    },
  };
}
