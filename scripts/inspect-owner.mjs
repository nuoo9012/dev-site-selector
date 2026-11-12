// 토지소유정보 CSV(data/raw/owner/*.csv)를 한 번 훑어 값의 종류와 구조를 보여주는 개발용 도구: `node scripts/inspect-owner.mjs`
// 소유자 이름은 원본에 없다(코드·구분만 있음). 개인정보가 될 만한 값은 출력하지 않고, 구분 값의 종류와 건수만 센다.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import iconv from "iconv-lite";

const dir = path.resolve("data/raw/owner");
const file = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith(".csv"));
if (!file) {
  console.error("data/raw/owner/ 에 CSV가 없어요.");
  process.exit(1);
}

const rl = readline.createInterface({ input: fs.createReadStream(path.join(dir, file)).pipe(iconv.decodeStream("cp949")), crlfDelay: Infinity });
let header = null;
let idx = {};
const owner = new Map(); // 소유구분 "코드:이름" → 건수
const agency = new Map(); // 국가기관구분 → 건수 (국유지·공유지 등에서만)
const registerKinds = new Map(); // 대장구분
const pnuRows = new Map(); // 고유번호별 줄 수 (공유인 확인) — 메모리 보호를 위해 앞 3백만 줄만
const refMonth = new Map();
const baseDates = new Map();
let rows = 0;
let sampleState = [];

const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);

for await (const line of rl) {
  if (!header) {
    header = line.replace(/^﻿/, "").split(",");
    header.forEach((h, i) => (idx[h] = i));
    console.log("열:", header.join(" | "));
    continue;
  }
  const c = line.split(",");
  if (c.length < header.length) continue;
  rows += 1;
  bump(owner, `${c[idx["소유구분코드"]]}:${c[idx["소유구분"]]}`);
  bump(registerKinds, `${c[idx["대장구분코드"]]}:${c[idx["대장구분명"]]}`);
  bump(refMonth, c[idx["기준연월"]]);
  bump(baseDates, c[idx["데이터기준일자"]]);
  const ownerName = c[idx["소유구분"]];
  if (/국유|국가|지방|공유|시|군|도/.test(ownerName)) bump(agency, `${ownerName} / ${c[idx["국가기관구분코드"]]}:${c[idx["국가기관구분"]]}`);
  if (rows <= 3_000_000) bump(pnuRows, c[idx["고유번호"]]);
  if (ownerName === "국유지" && sampleState.length < 3) sampleState.push({ 법정동: c[idx["법정동명"]], 지번: c[idx["지번"]], 지목: c[idx["지목"]], 면적: c[idx["토지면적"]], 기관: c[idx["국가기관구분"]], 공유인수: c[idx["공유인수"]] });
}

const top = (m, n = 40) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
console.log("\n전체 줄 수:", rows.toLocaleString("ko-KR"));
console.log("\n소유구분 (코드:이름 → 줄 수)");
console.table(top(owner));
console.log("\n대장구분:", top(registerKinds));
console.log("기준연월:", top(refMonth), "데이터기준일자:", top(baseDates, 5));
console.log("\n국유·공유·지자체 계열의 국가기관구분 (상위)");
console.table(top(agency, 30));
const multi = [...pnuRows.values()].filter((n) => n > 1).length;
console.log(`\n(앞 3백만 줄) 고유번호 ${pnuRows.size.toLocaleString("ko-KR")}개 중 2줄 이상(공유 등) ${multi.toLocaleString("ko-KR")}개`);
console.log("국유지 예시(주소 일부만):", sampleState);
