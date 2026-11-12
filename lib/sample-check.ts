// 표본 선별 정확도 확인 도구 (PLAN 작업 16, 성공 기준 SC-3)
// 담당자가 직접 고른 필지 표본(구·동·지번)이 선별 결과의 후보 목록에 얼마나 들어오는지 비교한다.
// Design Ref: §10.5 — 정확도 표본 50건. PRD 3번 — "표본 50건 중 90% 이상이 후보 목록에 포함",
// "확인 필요"로 분류된 표본은 포함으로 세지 않고 따로 집계한다.
// 앱 화면·서버에서는 쓰지 않는다 (검증용). 비용이 드는 AI는 쓰지 않는다.

import iconv from "iconv-lite";
import Papa from "papaparse";
import { judgeParcel } from "./selection";
import type { Conditions, Parcel } from "./types";

/** 표본 한 줄 (담당자가 적은 값 그대로) */
export interface SampleRow {
  /** 파일의 줄 번호 (머리글이 1줄) */
  line: number;
  sigungu: string;
  dong: string;
  jibun: string;
}

export interface SampleParse {
  rows: SampleRow[];
  /** 읽지 못한 줄·열에 대한 안내 (한국어) */
  problems: string[];
}

// ───────────── 파일 읽기 ─────────────

/** CSV 바이트를 글자로 바꾼다. UTF-8이 아니면 엑셀이 한국어 윈도우에서 저장하는 EUC-KR(cp949)로 본다. */
export function decodeCsv(buffer: Buffer): string {
  const body = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf ? buffer.subarray(3) : buffer;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return iconv.decode(body, "cp949");
  }
}

const HEADER_ALIASES = {
  sigungu: ["구", "시군구", "자치구"],
  dong: ["동", "법정동", "동명"],
  jibun: ["지번", "번지"],
  address: ["주소", "소재지"],
} as const;

/** 머리글 이름을 찾는다 (공백 무시) */
function findHeader(headers: string[], names: readonly string[]): string | undefined {
  return headers.find((h) => names.includes(h.replace(/\s+/g, "")));
}

// "서울특별시 영등포구 여의도동 50" / "영등포구 영등포동1가 산 12-3" 같은 주소 한 줄에서 구·동·지번을 뽑는다
const ADDRESS_PATTERN = /(영등포구|도봉구)\s*([가-힣]+동\d*가?)\s*(산?\s*\d+(?:-\d+)?)/;

/**
 * 표본 CSV 글자를 읽는다.
 * 열 이름은 "구, 동, 지번" 또는 "주소" 중 하나를 쓰면 된다 (비슷한 이름도 허용).
 */
export function parseSampleCsv(text: string): SampleParse {
  // 빈 줄은 읽기 도구에 맡기지 않고 아래에서 직접 건너뛴다. 그래야 빈 줄이 있어도 안내하는 줄 번호가 파일과 같다.
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: false });
  const headers = parsed.meta.fields ?? [];
  const sigunguCol = findHeader(headers, HEADER_ALIASES.sigungu);
  const dongCol = findHeader(headers, HEADER_ALIASES.dong);
  const jibunCol = findHeader(headers, HEADER_ALIASES.jibun);
  const addressCol = findHeader(headers, HEADER_ALIASES.address);

  const useParts = sigunguCol && dongCol && jibunCol;
  if (!useParts && !addressCol) {
    return {
      rows: [],
      problems: [`열 이름을 찾지 못했어요. 첫 줄에 "구, 동, 지번" 또는 "주소"를 적어 주세요. (지금 첫 줄: ${headers.join(", ") || "비어 있음"})`],
    };
  }

  const rows: SampleRow[] = [];
  const problems: string[] = [];
  parsed.data.forEach((record, index) => {
    const line = index + 2; // 머리글이 1줄
    if (Object.values(record).every((value) => !(value ?? "").trim())) return; // 완전히 빈 줄 (",,"도 포함)
    let sigungu: string;
    let dong: string;
    let jibun: string;
    if (useParts) {
      sigungu = record[sigunguCol] ?? "";
      dong = record[dongCol] ?? "";
      jibun = record[jibunCol] ?? "";
    } else {
      const match = ADDRESS_PATTERN.exec(record[addressCol!] ?? "");
      if (!match) {
        problems.push(`${line}줄: 주소에서 구·동·지번을 찾지 못했어요 ("${(record[addressCol!] ?? "").trim()}")`);
        return;
      }
      [, sigungu, dong, jibun] = match;
    }
    if (!sigungu.trim() || !dong.trim() || !jibun.trim()) {
      problems.push(`${line}줄: 구·동·지번 중 빈 칸이 있어요`);
      return;
    }
    rows.push({ line, sigungu: sigungu.trim(), dong: dong.trim(), jibun: jibun.trim() });
  });
  return { rows, problems };
}

// ───────────── 필지 찾기 ─────────────

const normalizeSigungu = (s: string) => {
  const v = s.replace(/\s+/g, "");
  return v.endsWith("구") ? v : `${v}구`; // "영등포" → "영등포구"
};
const normalizeDong = (s: string) => s.replace(/\s+/g, "");
/** 지번: 공백·"번지"를 없애고 "12-0"은 "12"로 본다 ("산 12"와 "산12"가 같게) */
const normalizeJibun = (s: string) => s.replace(/\s+/g, "").replace(/번지$/, "").replace(/-0+$/, "");

const dongOf = (p: Parcel) => normalizeDong(p.address.split(" ").slice(2).join(""));
const keyOf = (sigungu: string, dong: string, jibun: string) => `${sigungu}|${dong}|${jibun}`;

export type SampleOutcome =
  | { kind: "candidate" } // 후보 목록에 포함 ✅
  | { kind: "needsCheck"; missing: string[] } // 값이 비어 판정 못함 (포함으로 세지 않음)
  | { kind: "excluded"; reasons: string[] } // 조건에 맞지 않아 제외됨 ❌ — 이유 포함
  | { kind: "notFound" }; // 데이터에서 찾지 못함 (지번 오류이거나 대상 구가 아님)

export interface SampleItem {
  row: SampleRow;
  outcome: SampleOutcome;
  parcel?: Parcel;
}

export interface SampleReport {
  /** 중복을 뺀 표본 건수 */
  total: number;
  candidate: number;
  needsCheck: number;
  excluded: number;
  notFound: number;
  /** 같은 필지를 두 번 적은 줄 (건수에서 뺀다) */
  duplicateLines: number[];
  /** 후보에 포함된 비율 (후보 ÷ 전체 표본). 성공 기준 SC-3은 90% 이상 */
  rate: number;
  items: SampleItem[];
}

/** 제외된 이유를 사람이 읽는 문장으로 */
export function explainExclusion(parcel: Parcel, conditions: Conditions): string[] {
  const reasons: string[] = [];
  if (parcel.area !== null && parcel.area < conditions.minArea) {
    reasons.push(`면적 ${parcel.area.toLocaleString("ko-KR")}㎡ (기준: ${conditions.minArea.toLocaleString("ko-KR")}㎡ 이상)`);
  }
  if (parcel.landCategory !== null && !conditions.landCategories.includes(parcel.landCategory)) {
    reasons.push(`지목 ${parcel.landCategory} (기준: ${conditions.landCategories.join(", ")})`);
  }
  if (parcel.zone1 !== null && !conditions.zones.includes(parcel.zone1)) {
    const second = parcel.zone2 && conditions.zones.includes(parcel.zone2) ? ` — 두 번째 용도지역 ${parcel.zone2}은(는) 조건에 맞지만 판정은 주된 용도지역 기준` : "";
    reasons.push(`용도지역 ${parcel.zone1} (기준: ${conditions.zones.join(", ")})${second}`);
  }
  return reasons;
}

/** 표본이 선별 결과의 후보에 얼마나 들어오는지 비교한다 */
export function checkSample(rows: readonly SampleRow[], parcels: readonly Parcel[], conditions: Conditions): SampleReport {
  const byKey = new Map<string, Parcel>();
  for (const p of parcels) byKey.set(keyOf(p.sigungu, dongOf(p), normalizeJibun(p.jibun)), p);

  const seen = new Set<string>();
  const duplicateLines: number[] = [];
  const items: SampleItem[] = [];

  for (const row of rows) {
    const key = keyOf(normalizeSigungu(row.sigungu), normalizeDong(row.dong), normalizeJibun(row.jibun));
    if (seen.has(key)) {
      duplicateLines.push(row.line);
      continue;
    }
    seen.add(key);

    const parcel = byKey.get(key);
    if (!parcel) {
      items.push({ row, outcome: { kind: "notFound" } });
      continue;
    }
    const judgement = judgeParcel(parcel, conditions);
    const outcome: SampleOutcome =
      judgement.result === "match"
        ? { kind: "candidate" }
        : judgement.result === "unknown"
          ? { kind: "needsCheck", missing: judgement.missing }
          : { kind: "excluded", reasons: explainExclusion(parcel, conditions) };
    items.push({ row, outcome, parcel });
  }

  const count = (kind: SampleOutcome["kind"]) => items.filter((i) => i.outcome.kind === kind).length;
  const total = items.length;
  return {
    total,
    candidate: count("candidate"),
    needsCheck: count("needsCheck"),
    excluded: count("excluded"),
    notFound: count("notFound"),
    duplicateLines,
    rate: total === 0 ? 0 : count("candidate") / total,
    items,
  };
}

/** 비교 결과를 사람이 읽는 글로 만든다 */
export function formatSampleReport(report: SampleReport, conditions: Conditions, goal = { total: 50, rate: 0.9 }): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push(`표본 ${report.total}건 중 후보에 포함 ${report.candidate}건 → ${pct(report.rate)} (목표 ${pct(goal.rate)} 이상) ${report.rate >= goal.rate && report.total > 0 ? "✅ 통과" : "❌ 미달"}`);
  lines.push(`  · 후보 포함 ${report.candidate} · 확인 필요 ${report.needsCheck} (포함으로 세지 않음) · 조건에 안 맞아 제외 ${report.excluded} · 데이터에서 못 찾음 ${report.notFound}`);
  if (report.total !== goal.total) lines.push(`  ⚠️ 표본은 ${goal.total}건이 기준이에요 (지금 ${report.total}건).`);
  if (report.duplicateLines.length) lines.push(`  ⚠️ 같은 필지를 중복해서 적은 줄 ${report.duplicateLines.join(", ")}은(는) 건수에서 뺐어요.`);

  const misses = report.items.filter((i) => i.outcome.kind !== "candidate");
  if (misses.length) {
    lines.push("", "후보에 들어오지 못한 표본:");
    for (const { row, outcome, parcel } of misses) {
      const who = `${row.line}줄 ${row.sigungu} ${row.dong} ${row.jibun}`;
      if (outcome.kind === "notFound") lines.push(`  ❓ ${who} — 데이터에서 찾지 못했어요 (지번·동 이름을 확인해 주세요)`);
      else if (outcome.kind === "needsCheck") lines.push(`  ⚠️ ${who} — 확인 필요 (비어 있는 항목: ${outcome.missing.join(", ")})`);
      else if (outcome.kind === "excluded") {
        lines.push(`  ❌ ${who} — 제외: ${outcome.reasons.join(" / ") || "알 수 없음"}${parcel ? ` [지목 ${parcel.landCategory}, ${parcel.area}㎡, ${parcel.zone1}]` : ""}`);
      }
    }
    lines.push("", `적용한 조건: 면적 ${conditions.minArea.toLocaleString("ko-KR")}㎡ 이상 · 지목 ${conditions.landCategories.join(", ")} · 용도지역 ${conditions.zones.join(", ")}`);
  }
  return lines.join("\n");
}
