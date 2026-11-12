// 외부 공식 출처 대조 (PLAN 작업 16, 성공 기준 SC-3의 대체 확인)
// 담당자가 고른 표본이 없을 때, 우리 데이터·판정이 "다른 출처"와 맞는지 확인한다.
//  - 출처: 브이월드 공식 조회 API(토지특성정보, 국토교통부 자료). 우리는 같은 자료의 내려받은 파일(SHP)을 쓴다.
//  - 보는 것 ① 필드(지목·면적·용도지역) 일치율 — 특히 열 대응(A11·A12·A14·A16)을 값으로 추정해 정한 것이 맞는지
//  - 보는 것 ② 판정(후보/제외/확인 필요) 일치 — 공식 값으로 같은 규칙을 적용했을 때 우리 판정과 같은지
// 한계: "담당자의 판단"이 아니라 "공식 자료와의 일치"만 확인한다. 같은 원천 자료라서 데이터 자체의 오류는 못 잡는다.
// 키(VWORLD_API_KEY)는 .env에서만 읽고 어디에도 출력하지 않는다. 실행: npm run eval:external (비용 없음, 약 1분)

import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { DEFAULT_CONDITIONS } from "@/lib/conditions";
import { PARCEL_DATA } from "@/lib/parcels";
import { judgeParcel } from "@/lib/selection";
import type { Parcel } from "@/lib/types";

// 우리 원본의 기준일(2026-05-13)과 같은 해의 공식 자료. (확인 도구가 차이를 실제로 잡는지 시험할 때만 환경 변수로 다른 해를 쓴다)
const STDR_YEAR = process.env.EXTERNAL_STDR_YEAR ?? "2026";
const SEED = 20261112;
const DELAY_MS = 80; // 공식 서버에 부담을 주지 않도록 호출 사이를 조금 띄운다

// ───────────── 표본 뽑기 (같은 결과가 다시 나오도록 고정된 난수) ─────────────

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(list: readonly T[], n: number, rand: () => number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

type Group = "후보" | "경계 근처" | "무작위";

function drawSample(parcels: readonly Parcel[]): { parcel: Parcel; group: Group }[] {
  const rand = mulberry32(SEED);
  const isCandidate = (p: Parcel) => judgeParcel(p, DEFAULT_CONDITIONS).result === "match";
  const nearBoundary = (p: Parcel) =>
    // 후보가 아니지만 조건에 가까운 필지: 지목 대이고 (면적 900~999㎡ 이거나 면적 충분한데 용도지역만 다른 인접 지역)
    p.landCategory === "대" &&
    !isCandidate(p) &&
    ((p.area !== null && p.area >= 900 && p.area < 1000 && p.zone1 !== null && DEFAULT_CONDITIONS.zones.includes(p.zone1)) ||
      (p.area !== null && p.area >= 1000 && (p.zone1 === "제2종일반주거지역" || p.zone1 === "근린상업지역" || p.zone1 === "준공업지역")));
  return [
    ...pick(parcels.filter(isCandidate), 60, rand).map((parcel) => ({ parcel, group: "후보" as const })),
    ...pick(parcels.filter(nearBoundary), 40, rand).map((parcel) => ({ parcel, group: "경계 근처" as const })),
    ...pick(parcels, 50, rand).map((parcel) => ({ parcel, group: "무작위" as const })),
  ];
}

// ───────────── 공식 API 조회 ─────────────

interface Official {
  landCategory: string | null;
  area: number | null;
  zone1: string | null;
  zone2: string | null;
}

const clean = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s === "" || s === "지정되지않음" ? null : s;
};

async function fetchOfficial(pnu: string, key: string): Promise<Official | "none" | "error"> {
  const url = `https://api.vworld.kr/ned/data/getLandCharacteristics?key=${key}&domain=localhost&pnu=${pnu}&stdrYear=${STDR_YEAR}&format=json&numOfRows=10&pageNo=1`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as { landCharacteristicss?: { field?: Record<string, string>[] } };
      const rows = json.landCharacteristicss?.field ?? [];
      if (rows.length === 0) return "none";
      // 같은 필지가 여러 줄이면 가장 최근에 바뀐 줄을 쓴다
      const latest = [...rows].sort((a, b) => String(b.lastUpdtDt).localeCompare(String(a.lastUpdtDt)))[0];
      const area = parseFloat(latest.lndpclAr);
      return { landCategory: clean(latest.lndcgrCodeNm), area: area > 0 ? area : null, zone1: clean(latest.prposArea1Nm), zone2: clean(latest.prposArea2Nm) };
    } catch {
      // 연결 오류 — 주소(키 포함)가 오류 문구에 섞일 수 있어 내용은 출력하지 않고 다시 시도한다
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return "error";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const asParcel = (base: Parcel, o: Official): Parcel => ({ ...base, ...o });
const verdict = (p: Parcel) => judgeParcel(p, DEFAULT_CONDITIONS).result;
const label = { match: "후보", exclude: "제외", unknown: "확인 필요" } as const;

it("외부 공식 API 대조 (우리 데이터·판정이 공식 자료와 맞는지)", async () => {
  process.loadEnvFile(path.resolve(".env"));
  const key = process.env.VWORLD_API_KEY;
  expect(key, ".env에 VWORLD_API_KEY가 없어요").toBeTruthy();

  const sample = drawSample(PARCEL_DATA.parcels);
  const fieldStat = { 지목: [0, 0], 면적: [0, 0], 용도지역1: [0, 0], 용도지역2: [0, 0] } as Record<string, [number, number]>; // [일치, 비교한 수]
  const mismatches: string[] = [];
  const verdictMismatches: string[] = [];
  const byGroup = new Map<Group, { total: number; verdictSame: number }>();
  const confusion = new Map<string, number>(); // "우리→공식" 판정 조합
  let none = 0;
  let errors = 0;
  let compared = 0;

  for (const { parcel, group } of sample) {
    const official = await fetchOfficial(parcel.pnu, key!);
    await sleep(DELAY_MS);
    if (official === "none") { none++; mismatches.push(`- [${group}] ${parcel.address} ${parcel.jibun} — 공식 자료에 없음`); continue; }
    if (official === "error") { errors++; continue; }
    compared++;

    const same = {
      지목: parcel.landCategory === official.landCategory,
      면적: (parcel.area === null && official.area === null) || (parcel.area !== null && official.area !== null && Math.abs(parcel.area - official.area) < 0.5),
      용도지역1: parcel.zone1 === official.zone1,
      용도지역2: parcel.zone2 === official.zone2,
    };
    for (const [name, ok] of Object.entries(same)) {
      fieldStat[name][1]++;
      if (ok) fieldStat[name][0]++;
    }
    const diffs = Object.entries(same).filter(([, ok]) => !ok).map(([name]) => name);
    if (diffs.length) {
      mismatches.push(
        `- [${group}] ${parcel.address} ${parcel.jibun} — ${diffs.map((d) => {
          const o = { 지목: [parcel.landCategory, official.landCategory], 면적: [parcel.area, official.area], 용도지역1: [parcel.zone1, official.zone1], 용도지역2: [parcel.zone2, official.zone2] }[d]!;
          return `${d}: 우리 ${o[0] ?? "(빈 값)"} / 공식 ${o[1] ?? "(빈 값)"}`;
        }).join(", ")}`,
      );
    }

    const ours = verdict(parcel);
    const theirs = verdict(asParcel(parcel, official));
    const g = byGroup.get(group) ?? { total: 0, verdictSame: 0 };
    g.total++;
    if (ours === theirs) g.verdictSame++;
    else verdictMismatches.push(`- [${group}] ${parcel.address} ${parcel.jibun} — 우리 판정 ${label[ours]} / 공식 값으로 판정 ${label[theirs]}`);
    byGroup.set(group, g);
    const k = `${label[ours]} → ${label[theirs]}`;
    confusion.set(k, (confusion.get(k) ?? 0) + 1);
  }

  const pct = (a: number, b: number) => (b === 0 ? "-" : `${((a / b) * 100).toFixed(1)}%`);
  const verdictSame = [...byGroup.values()].reduce((s, g) => s + g.verdictSame, 0);
  const lines = [
    `외부 공식 API 대조: 표본 ${sample.length}건 중 비교 ${compared}건 (공식 자료에 없음 ${none}, 조회 오류 ${errors})`,
    "",
    "[필드 일치율] 우리 데이터(내려받은 파일) vs 공식 API",
    ...Object.entries(fieldStat).map(([name, [ok, total]]) => `  · ${name}: ${ok}/${total} = ${pct(ok, total)}`),
    "",
    `[판정 일치율] 같은 규칙을 공식 값에 적용했을 때 우리 판정과 같은가: ${verdictSame}/${compared} = ${pct(verdictSame, compared)}`,
    ...[...byGroup.entries()].map(([g, v]) => `  · ${g} ${v.total}건: ${v.verdictSame}건 일치 (${pct(v.verdictSame, v.total)})`),
    "  판정 조합(우리 → 공식): " + ([...confusion.entries()].map(([k, n]) => `${k} ${n}건`).join(", ") || "-"),
  ];
  if (verdictMismatches.length) lines.push("", "[판정이 다른 필지]", ...verdictMismatches);
  if (mismatches.length) lines.push("", `[값이 다른 필지 ${mismatches.length}건]`, ...mismatches.slice(0, 40), ...(mismatches.length > 40 ? [`  … 외 ${mismatches.length - 40}건`] : []));
  const text = lines.join("\n");
  console.log(`\n${text}\n`);

  fs.mkdirSync(path.resolve("evals/results"), { recursive: true });
  fs.writeFileSync(
    path.resolve("evals/results/external-check.md"),
    [
      "# 외부 공식 출처 대조 결과 (SC-3 대체 확인)",
      "",
      `- 측정 시각: ${new Date().toISOString()}`,
      `- 우리 데이터 기준일: ${JSON.stringify(PARCEL_DATA.meta.baseDates)} / 공식 API 기준연도: ${STDR_YEAR}`,
      "- 표본: 후보 60 + 경계 근처 40 + 무작위 50 (고정된 난수 seed " + SEED + "로 뽑아 다시 해도 같은 필지)",
      "- **한계:** 담당자가 직접 고른 표본(SC-3 원래 기준)이 아니라 공식 자료와의 일치를 본 것이다. 같은 원천 자료(국토교통부 토지특성정보)라서 원천 데이터의 오류는 잡지 못한다.",
      "",
      "```",
      text,
      "```",
      "",
    ].join("\n"),
    "utf8",
  );

  expect(errors, "조회 오류가 너무 많아요. 네트워크·키를 확인해 주세요").toBeLessThan(sample.length * 0.1);
  expect(compared).toBeGreaterThan(0);
}, 600_000);
