// 원본 토지특성정보 파일의 열 이름·인코딩·행 수를 확인하는 스크립트 (PLAN 작업 1)
// Design Ref: §3.1 — 원본 열 이름을 실제 파일로 확인해 대응표를 확정한다.
// 지원 형식: CSV(서울 전체 토지특성정보), DBF(브이월드 토지특성공간정보 SHP 묶음 안의 속성 파일)
// 실행: npm run inspect:raw            (data/raw/ 폴더 확인)
//       npm run inspect:raw -- <폴더>  (다른 폴더 확인)

import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import iconv from "iconv-lite";

// 확인할 대상 구 — 고유번호(PNU) 앞 5자리가 시군구 코드
const TARGET_SIGUNGU: Record<string, string> = {
  "11560": "영등포구",
  "11320": "도봉구",
};

// DESIGN.md 3.1 대응표의 열 이름, 비슷한 열을 찾을 때 쓸 단어,
// 그리고 브이월드 SHP(DBF) 파일에서 쓰는 코드 열 이름 (값을 보고 추정 — 컬럼 정의서로 최종 확인)
const EXPECTED_COLUMNS: { name: string; hints: string[]; dbfCode: string }[] = [
  { name: "고유번호", hints: ["고유번호", "PNU"], dbfCode: "A1" },
  { name: "법정동명", hints: ["법정동"], dbfCode: "A3" },
  { name: "특수지구분명", hints: ["특수지", "산"], dbfCode: "A5" },
  { name: "지번", hints: ["지번"], dbfCode: "A6" },
  { name: "지목명", hints: ["지목"], dbfCode: "A11" },
  { name: "토지면적", hints: ["면적"], dbfCode: "A12" },
  { name: "용도지역명1", hints: ["용도지역"], dbfCode: "A14" },
  { name: "용도지역명2", hints: ["용도지역"], dbfCode: "A16" },
  { name: "데이터기준일자", hints: ["기준일", "기준연도", "기준월"], dbfCode: "A26" },
];

// 비어 있는 값 수를 세어 볼 핵심 열 (선별 판정에 쓰는 열)
const KEY_COLUMNS = ["지목명", "토지면적", "용도지역명1"];

// 원본에서 "값 없음"을 뜻하는 글자 — 빈 값으로 본다 (예: 용도지역명2의 "지정되지않음")
const EMPTY_WORDS = ["", "지정되지않음"];

// 개인정보로 의심되는 열 이름에 들어가는 단어 (PRD 7번)
const PRIVACY_WORDS = ["소유", "성명", "이름", "연락", "전화", "주민", "생년", "휴대"];

type Encoding = "utf-8" | "cp949";

interface FileReport {
  file: string;
  format: "CSV" | "DBF";
  encoding: Encoding;
  encodingNote?: string;
  headers: string[];
  sample: string[];
  totalRows: number;
  targetRows: Record<string, number>;
  blankCounts: Record<string, number>; // 대상 구 행 중 핵심 열이 비어 있는 수
  pnuColumn: string | null;
  baseDates: string[]; // 데이터기준일자 값 종류
}

// 바이트가 UTF-8로 깨짐 없이 읽히는지 검사한다. 아니면 EUC-KR(cp949)로 본다.
function guessEncoding(bytes: Buffer): Encoding {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  // 잘린 마지막 글자 때문에 오판하지 않도록 끝 4바이트는 빼고 검사
  const body = bytes.length > 4 ? bytes.subarray(0, bytes.length - 4) : bytes;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(body);
    return "utf-8";
  } catch {
    return "cp949";
  }
}

function newReport(filePath: string, format: "CSV" | "DBF", encoding: Encoding): FileReport {
  return {
    file: path.basename(filePath),
    format,
    encoding,
    headers: [],
    sample: [],
    totalRows: 0,
    targetRows: Object.fromEntries(Object.values(TARGET_SIGUNGU).map((n) => [n, 0])),
    blankCounts: {},
    pnuColumn: null,
    baseDates: [],
  };
}

// 열 이름 목록에서 대응표 항목의 실제 열 위치를 찾는다 (이름이 같거나, DBF 코드 열이 같거나)
function findColumn(headers: string[], expectedName: string): number {
  const col = EXPECTED_COLUMNS.find((c) => c.name === expectedName);
  const byName = headers.indexOf(expectedName);
  if (byName >= 0 || !col) return byName;
  return headers.indexOf(col.dbfCode);
}

// 한 행을 받아 건수·빈 값·기준일을 집계하는 도우미 (CSV·DBF 공용)
function makeCounter(report: FileReport) {
  let pnuIndex = -1;
  let dateIndex = -1;
  const keyIndexes: { name: string; index: number }[] = [];
  const dates = new Set<string>();

  return {
    // 열 이름이 정해진 뒤 한 번 호출
    setHeaders(headers: string[]) {
      report.headers = headers;
      pnuIndex = findColumn(headers, "고유번호");
      if (pnuIndex < 0) pnuIndex = headers.findIndex((h) => h.toUpperCase() === "PNU");
      dateIndex = findColumn(headers, "데이터기준일자");
      for (const name of KEY_COLUMNS) {
        const index = findColumn(headers, name);
        if (index >= 0) {
          keyIndexes.push({ name, index });
          report.blankCounts[name] = 0;
        }
      }
    },
    addRow(row: string[]) {
      if (report.sample.length === 0) {
        report.sample = row;
        // 열 이름으로 못 찾으면 19자리 숫자 값이 있는 열을 고유번호로 본다
        if (pnuIndex < 0) pnuIndex = row.findIndex((v) => /^\d{19}$/.test(v));
        report.pnuColumn = pnuIndex >= 0 ? (report.headers[pnuIndex] ?? `${pnuIndex + 1}번째 열`) : null;
      }
      report.totalRows += 1;
      if (dateIndex >= 0 && row[dateIndex]) dates.add(row[dateIndex]);
      if (pnuIndex < 0) return;
      const guName = TARGET_SIGUNGU[(row[pnuIndex] ?? "").slice(0, 5)];
      if (!guName) return;
      report.targetRows[guName] += 1;
      for (const { name, index } of keyIndexes) {
        const value = row[index] ?? "";
        // 면적은 0 이하도 빈 값으로 본다 (Design Ref: §3.1 — 빈칸·0이면 null)
        const blank = name === "토지면적" ? !(parseFloat(value) > 0) : EMPTY_WORDS.includes(value);
        if (blank) report.blankCounts[name] += 1;
      }
    },
    finish() {
      report.baseDates = [...dates].sort();
    },
  };
}

// CSV를 끝까지 읽으며(스트리밍) 집계한다. 큰 파일도 메모리를 적게 쓴다.
function inspectCsv(filePath: string): Promise<FileReport> {
  const fd = fs.openSync(filePath, "r");
  const head = Buffer.alloc(64 * 1024);
  const n = fs.readSync(fd, head, 0, head.length, 0);
  fs.closeSync(fd);
  const encoding = guessEncoding(head.subarray(0, n));
  const report = newReport(filePath, "CSV", encoding);
  const counter = makeCounter(report);

  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath).pipe(iconv.decodeStream(encoding));
    Papa.parse<string[]>(stream as unknown as NodeJS.ReadableStream, {
      skipEmptyLines: true,
      step: (result) => {
        const row = result.data.map((v) => (v ?? "").trim());
        if (report.headers.length === 0) {
          counter.setHeaders(row.map((h) => h.replace(/^﻿/, "")));
          return;
        }
        counter.addRow(row);
      },
      complete: () => {
        counter.finish();
        resolve(report);
      },
      error: (err: Error) => reject(err),
    });
  });
}

// DBF(dBASE) 파일을 조금씩 읽으며 집계한다.
// 구조: 머리(32바이트) + 열 정의(32바이트씩, 0x0D로 끝) + 레코드(삭제표시 1바이트 + 열 값들)
function inspectDbf(filePath: string): FileReport {
  const fd = fs.openSync(filePath, "r");
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

  // 인코딩: .cpg 파일 표시는 틀릴 수 있어(예: UTF-8로 적혀 있지만 실제 EUC-KR) 앞 레코드 바이트로 직접 판단
  const sampleCount = Math.min(recordCount, 200);
  const sampleBuf = Buffer.alloc(sampleCount * recordLength);
  fs.readSync(fd, sampleBuf, 0, sampleBuf.length, headerLength);
  const encoding = guessEncoding(Buffer.concat([sampleBuf, Buffer.alloc(4)]));
  const report = newReport(filePath, "DBF", encoding);
  const cpgPath = filePath.replace(/\.dbf$/i, ".cpg");
  if (fs.existsSync(cpgPath)) {
    const cpg = fs.readFileSync(cpgPath, "utf8").trim();
    const claimsUtf8 = /utf-?8/i.test(cpg);
    if (claimsUtf8 !== (encoding === "utf-8")) report.encodingNote = `.cpg 파일에는 "${cpg}"라고 적혀 있지만 실제와 달라요`;
  } else if (encoding === "cp949") {
    report.encodingNote = ".cpg 파일 표시와 관계없이 EUC-KR로 읽어야 해요";
  }

  const counter = makeCounter(report);
  counter.setHeaders(fields.map((f) => f.name));

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
      const row: string[] = [];
      for (const f of fields) {
        row.push(iconv.decode(chunk.subarray(p, p + f.length), encoding).trim());
        p += f.length;
      }
      counter.addRow(row);
    }
  }
  fs.closeSync(fd);
  counter.finish();
  return report;
}

function printReport(r: FileReport) {
  const line = "─".repeat(60);
  console.log(`\n${line}\n📄 ${r.file} (${r.format})\n${line}`);
  console.log(`인코딩: ${r.encoding === "cp949" ? "EUC-KR(cp949) — 정리 스크립트에서 변환 필요" : "UTF-8"}`);
  if (r.encodingNote) console.log(`  ⚠️ ${r.encodingNote}`);
  console.log(`전체 행 수: ${r.totalRows.toLocaleString()}건`);
  console.log(`데이터 기준일: ${r.baseDates.length ? r.baseDates.join(", ") : "찾지 못함"}`);

  // 대상 구별 건수
  console.log(`\n[대상 구 건수] (고유번호 열: ${r.pnuColumn ?? "찾지 못함"})`);
  if (!r.pnuColumn) {
    console.log("  ⚠️ 고유번호(PNU) 열을 찾지 못해 구별로 셀 수 없어요.");
  } else {
    for (const [gu, n] of Object.entries(r.targetRows)) {
      console.log(`  ${n > 0 ? "✅" : "－"} ${gu}: ${n.toLocaleString()}건`);
    }
  }

  // 열 목록과 첫 행 예시 (코드 열이면 추정한 뜻도 함께)
  console.log(`\n[열 목록] 총 ${r.headers.length}개 (열 이름 = 첫 행 예시 값)`);
  r.headers.forEach((h, i) => {
    const meaning = EXPECTED_COLUMNS.find((c) => c.dbfCode === h && /^A\d+$/.test(h));
    console.log(`  ${String(i + 1).padStart(2)}. ${h}${meaning ? ` (${meaning.name} 추정)` : ""} = ${r.sample[i] ?? ""}`);
  });
  if (r.headers.every((h) => /^A\d+$/i.test(h))) {
    console.log("  ℹ️ 열 이름이 A0, A1… 코드예요. '추정' 표시는 값을 보고 짐작한 것이니 브이월드 '컬럼 정의서'로 확인해 주세요.");
  }

  // DESIGN.md 대응표와 비교
  console.log("\n[DESIGN.md 3.1 대응표와 비교]");
  for (const col of EXPECTED_COLUMNS) {
    if (r.headers.includes(col.name)) {
      console.log(`  ✅ ${col.name}`);
    } else if (r.headers.includes(col.dbfCode) && /^A\d+$/.test(col.dbfCode)) {
      const value = r.sample[r.headers.indexOf(col.dbfCode)] ?? "";
      console.log(`  ✅ ${col.name} → ${col.dbfCode} (예: ${value})`);
    } else {
      const similar = r.headers.filter((h) => col.hints.some((w) => h.includes(w)));
      console.log(`  ❌ ${col.name} 없음${similar.length ? ` → 비슷한 열: ${similar.join(", ")}` : ""}`);
    }
  }

  // 핵심 열 빈 값 (대상 구 행 기준)
  const keys = Object.entries(r.blankCounts);
  if (keys.length) {
    console.log('\n[대상 구 행 중 비어 있는 값] ("확인 필요" 예상 규모, "지정되지않음"도 빈 값으로 셈)');
    for (const [name, n] of keys) console.log(`  ${name}: ${n.toLocaleString()}건`);
  }

  // 개인정보 의심 열 (PRD 7번)
  const privacy = r.headers.filter((h) => PRIVACY_WORDS.some((w) => h.includes(w)));
  console.log("\n[개인정보 의심 열]");
  console.log(privacy.length ? `  ⚠️ ${privacy.join(", ")} — 정리 단계에서 삭제해야 해요.` : "  열 이름 기준으로는 없음 ✅");
}

async function main() {
  const dir = path.resolve(process.argv[2] ?? "data/raw");
  if (!fs.existsSync(dir)) {
    console.log(`폴더가 없어요: ${dir}\ndata/README.md 안내대로 파일을 받아 넣어 주세요.`);
    process.exitCode = 1;
    return;
  }
  const entries = fs.readdirSync(dir);
  const zips = entries.filter((f) => f.toLowerCase().endsWith(".zip"));
  const targets = entries.filter((f) => /\.(csv|dbf)$/i.test(f));

  if (zips.length) {
    console.log(`📦 압축 파일이 있어요: ${zips.join(", ")}\n   압축을 풀어 CSV 또는 DBF 파일을 같은 폴더에 넣어 주세요.`);
  }
  if (!targets.length) {
    console.log(`CSV·DBF 파일이 없어요: ${dir}\ndata/README.md 안내대로 파일을 받아 넣어 주세요.`);
    process.exitCode = 1;
    return;
  }

  console.log(`🔍 ${dir} 에서 파일 ${targets.length}개를 확인합니다. (큰 파일은 1~2분 걸릴 수 있어요)`);
  for (const f of targets) {
    const full = path.join(dir, f);
    try {
      printReport(f.toLowerCase().endsWith(".dbf") ? inspectDbf(full) : await inspectCsv(full));
    } catch (err) {
      console.log(`\n❌ ${f} 를 읽지 못했어요: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }
  console.log("\n다음 단계: 위 결과로 DESIGN.md 3.1 대응표의 실제 열 이름을 확정합니다.");
}

main();
