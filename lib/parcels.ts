// 정리된 필지 데이터 읽기 (PLAN 작업 9)
// Design Ref: §11.1 — data/parcels.json은 코드에 함께 묶여(import) Vercel에 올라간다.
// 서버 쪽 코드(API)에서만 쓴다. 브라우저 코드에서 가져오면 11MB가 화면에 실려 가므로 쓰지 않는다.

import parcelData from "../data/parcels.json";
import type { ParcelData } from "./types";

// JSON을 그대로 가져오면 타입이 너무 커지므로 정해 둔 모양(ParcelData)으로 본다.
// 모양은 scripts/prepare-data.mts가 보장한다.
export const PARCEL_DATA = parcelData as unknown as ParcelData;
