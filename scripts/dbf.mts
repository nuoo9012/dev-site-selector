// 원본 토지특성 DBF 파일 읽기 도구 (정리 스크립트들이 함께 쓴다)
// Design Ref: §3.1 — 필요한 열만 남기고, "값 없음"은 null로 바꾼다.

import fs from "node:fs";
import iconv from "iconv-lite";
import type { Parcel } from "../lib/types.ts";
import { SIGUNGU_BY_CODE } from "../lib/types.ts";

// 원본 열 코드 → 뜻 (Design Ref: §3.1 대응표)
export const COL = {
  pnu: "A1", // 고유번호
  address: "A3", // 법정동명
  special: "A5", // 특수지구분명 (일반 / 산)
  jibun: "A6", // 지번
  landCategory: "A11", // 지목명
  area: "A12", // 토지면적
  zone1: "A14", // 용도지역명1
  zone2: "A16", // 용도지역명2
  baseDate: "A26", // 데이터기준일자
} as const;

// 원본에서 "값 없음"을 뜻하는 글자
const EMPTY_WORDS = ["", "지정되지않음"];

export type Encoding = "utf-8" | "cp949";

// 바이트가 UTF-8로 깨짐 없이 읽히면 UTF-8, 아니면 EUC-KR(cp949).
// .cpg 파일 표시는 틀릴 수 있어(UTF-8로 적혀 있지만 실제 EUC-KR) 직접 판단한다.
function guessEncoding(bytes: Buffer): Encoding {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "utf-8";
  } catch {
    return "cp949";
  }
}

// DBF 파일의 모든 레코드를 { 열코드: 값 } 형태로 하나씩 넘겨준다.
// 구조: 머리(32바이트) + 열 정의(32바이트씩, 0x0D로 끝) + 레코드(삭제표시 1바이트 + 열 값들)
export function readDbf(filePath: string, onRecord: (rec: Record<string, string>) => void): { encoding: Encoding } {
  const fd = fs.openSync(filePath, "r");
  try {
    const top = Buffer.alloc(32);
    fs.readSync(fd, top, 0, 32, 0);
    const recordCount = top.readUInt32LE(4);
    const headerLength = top.readUInt16LE(8);
    const recordLength = top.readUInt16LE(10);

    const headerBuf = Buffer.alloc(headerLength);
    fs.readSync(fd, headerBuf, 0, headerLength, 0);
    const fields: { name: string; length: number }[] = [];
    for (let o = 32; o + 32 <= headerLength && headerBuf[o] !== 0x0d; o += 32) {
      fields.push({
        name: headerBuf.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""),
        length: headerBuf[o + 16],
      });
    }

    // 앞 200건으로 인코딩 판단
    const sample = Buffer.alloc(Math.min(recordCount, 200) * recordLength);
    fs.readSync(fd, sample, 0, sample.length, headerLength);
    const encoding = guessEncoding(sample);

    // 한 번에 1,000건씩 읽는다
    const chunkRecords = 1000;
    const chunk = Buffer.alloc(chunkRecords * recordLength);
    for (let start = 0; start < recordCount; start += chunkRecords) {
      const count = Math.min(chunkRecords, recordCount - start);
      fs.readSync(fd, chunk, 0, count * recordLength, headerLength + start * recordLength);
      for (let r = 0; r < count; r++) {
        const base = r * recordLength;
        if (chunk[base] === 0x2a) continue; // "*" = 삭제된 레코드
        let p = base + 1;
        const rec: Record<string, string> = {};
        for (const f of fields) {
          rec[f.name] = iconv.decode(chunk.subarray(p, p + f.length), encoding).trim();
          p += f.length;
        }
        onRecord(rec);
      }
    }
    return { encoding };
  } finally {
    fs.closeSync(fd);
  }
}

// "값 없음"이면 null, 아니면 그대로 (PRD must ① 규칙 8: 없는 값은 추측하지 않음)
export function textOrNull(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  return EMPTY_WORDS.includes(v) ? null : v;
}

// 면적: 숫자로 바꾸고 0 이하·숫자 아님은 null (소수 둘째 자리까지)
export function areaOrNull(value: string | undefined): number | null {
  const n = parseFloat(value ?? "");
  return n > 0 ? Math.round(n * 100) / 100 : null;
}

// 지번: 산이면 앞에 "산 "을 붙인다. 특수지구분명이 비어 있으면 고유번호 11번째 자리(2 = 산)로 판단
export function makeJibun(rec: Record<string, string>): string {
  const special = rec[COL.special] ?? "";
  const isMountain = special ? special === "산" : (rec[COL.pnu] ?? "")[10] === "2";
  const jibun = rec[COL.jibun] ?? "";
  return isMountain ? `산 ${jibun}` : jibun;
}

/** 원본 한 줄을 정리된 필지로 바꾼다. 고유번호가 올바르지 않거나 대상 구가 아니면 null */
export function toParcel(rec: Record<string, string>): { parcel: Parcel; baseDate: string } | null {
  const pnu = rec[COL.pnu] ?? "";
  const sigungu = (SIGUNGU_BY_CODE as Record<string, Parcel["sigungu"]>)[pnu.slice(0, 5)];
  if (!/^\d{19}$/.test(pnu) || !sigungu) return null;
  return {
    parcel: {
      pnu,
      sigungu,
      address: rec[COL.address] ?? "",
      jibun: makeJibun(rec),
      landCategory: textOrNull(rec[COL.landCategory]),
      area: areaOrNull(rec[COL.area]),
      zone1: textOrNull(rec[COL.zone1]),
      zone2: textOrNull(rec[COL.zone2]),
    },
    baseDate: rec[COL.baseDate] ?? "",
  };
}
