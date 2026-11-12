// POST /api/export — 같은 조건으로 선별을 다시 실행해 엑셀 파일로 돌려준다 (PLAN 작업 12)
// Design Ref: §3.4, §5 — 결과 자체가 아니라 조건을 받아서 다시 계산한다 (같은 조건 = 같은 결과).
// 화면의 500건 제한과 달리 후보·확인 필요 전체 건수를 담는다 (PRD must ②).

import { buildExcel, excelFileName } from "@/lib/excel";
import { findParcels, getSummary } from "@/lib/parcel-store";
import { readConditions } from "@/lib/request";
import { selectParcels } from "@/lib/selection";
import { storeErrorResponse } from "@/lib/store-error";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function POST(request: Request): Promise<Response> {
  const read = await readConditions(request);
  if (!read.ok) return read.response;

  try {
    const [parcels, summary] = await Promise.all([findParcels(read.conditions), getSummary()]);
    const result = selectParcels(parcels, read.conditions);
    const file = await buildExcel({ conditions: read.conditions, result, baseDates: summary.baseDates, ownerBaseDate: summary.ownerBaseDate });

    const fileName = excelFileName();
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": XLSX_TYPE,
        // 한글 파일 이름은 filename* (UTF-8 인코딩)로 보내고, 옛 프로그램용으로 영문 이름도 함께 둔다
        "Content-Disposition": `attachment; filename="parcels.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        // 조건마다 결과가 다르므로 저장해 두고 재사용하지 않는다
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const response = storeErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
