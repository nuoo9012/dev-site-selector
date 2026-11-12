// POST /api/select — 조건으로 필지를 선별해 후보와 "확인 필요"를 돌려준다 (PLAN 작업 9)
// Design Ref: §3.2, §5 — 판정은 AI가 아니라 lib/selection.ts의 코드가 한다.
// 서울 확장: 필지는 데이터베이스에서 "제외가 확실하지 않은 것"만 가져와 같은 코드로 판정한다.

import { findParcels, getSummary } from "@/lib/parcel-store";
import { readConditions } from "@/lib/request";
import { selectParcels } from "@/lib/selection";
import { storeErrorResponse } from "@/lib/store-error";
import { MAX_DISPLAY_ROWS, type SelectResponse } from "@/lib/types";

export async function POST(request: Request): Promise<Response> {
  const read = await readConditions(request);
  if (!read.ok) return read.response;

  try {
    const [parcels, summary] = await Promise.all([findParcels(read.conditions), getSummary()]);
    // Plan SC: SC-1 5분 이내 · 비기능 3초 이내
    const { candidates, needsCheck } = selectParcels(parcels, read.conditions);

    const body: SelectResponse = {
      candidateTotal: candidates.length,
      needsCheckTotal: needsCheck.length,
      // 화면에는 상위 500건까지만 보내고 전체는 엑셀로 받는다 (PLAN FR-12)
      candidates: candidates.slice(0, MAX_DISPLAY_ROWS),
      needsCheck: needsCheck.slice(0, MAX_DISPLAY_ROWS),
      truncated: candidates.length > MAX_DISPLAY_ROWS || needsCheck.length > MAX_DISPLAY_ROWS,
      conditions: read.conditions,
      baseDates: summary.baseDates,
    };
    return Response.json(body);
  } catch (error) {
    const response = storeErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
