// 조건 변환 측정 공통 도구 (PLAN 작업 16) — 문장 세트를 AI로 돌려 기대값과 비교하고 결과 글을 만든다
// 실제 OpenAI를 부른다 (비용은 아주 작다). 키는 .env에서만 읽고 출력하지 않는다.

import type { AiClient } from "@/lib/ai";
import { AI_MODEL, AiError } from "@/lib/ai";
import { DEFAULT_CONDITIONS } from "@/lib/conditions";
import { parseConditionText } from "@/lib/parse-condition";
import type { ParseConditionResponse } from "@/lib/types";
import type { ConditionCase, OkCase } from "./condition-cases";

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

/** 응답이 기대와 맞는지 판정. 틀리면 이유를 돌려준다 */
export function judge(c: ConditionCase, r: ParseConditionResponse | "error"): { correct: boolean; why: string } {
  if (r === "error") return { correct: false, why: "AI 연결 오류" };
  if (c.status !== "ok") {
    if (r.status !== c.status) return { correct: false, why: `상태가 ${r.status} (기대: ${c.status})${"message" in r ? ` — ${r.message}` : ""}` };
    return { correct: !("conditions" in r), why: "conditions" in r ? "안내여야 하는데 조건이 실행 가능한 형태로 옴" : "" };
  }
  if (r.status !== "ok") return { correct: false, why: `상태가 ${r.status} (기대: ok) — ${r.message}` };

  const expected: OkCase = c;
  const problems: string[] = [];
  const tol = expected.areaTolerance ?? 0;
  if (expected.minArea === "default") {
    if (!r.defaulted.includes("minArea") || r.conditions.minArea !== DEFAULT_CONDITIONS.minArea) problems.push(`면적은 기본값이어야 하는데 ${r.conditions.minArea}`);
  } else if (r.defaulted.includes("minArea") || Math.abs(r.conditions.minArea - expected.minArea) > tol) {
    problems.push(`면적 ${r.conditions.minArea} (기대 ${expected.minArea}${tol ? ` ±${tol}` : ""})`);
  }
  for (const [key, label] of [
    ["landCategories", "지목"],
    ["zones", "용도지역"],
  ] as const) {
    const want = expected[key];
    const got = r.conditions[key];
    if (want === "default") {
      if (!r.defaulted.includes(key) || !sameSet(got, DEFAULT_CONDITIONS[key])) problems.push(`${label}은 기본값이어야 하는데 ${got.join(",")}`);
    } else if (r.defaulted.includes(key) || !sameSet(got, want)) {
      problems.push(`${label} ${got.join(",")} (기대 ${want.join(",")})`);
    }
  }
  // 소유구분: 말하지 않았으면 조건에 없어야 하고, 말했으면 같은 목록이어야 한다
  const gotOwners = r.conditions.owners ?? [];
  const wantOwners = expected.owners ?? [];
  if (!sameSet(gotOwners, wantOwners)) problems.push(`소유구분 ${gotOwners.join(",") || "(없음)"} (기대 ${wantOwners.join(",") || "(없음)"})`);
  const gotShapes = r.conditions.excludeShapes ?? [];
  const wantShapes = expected.excludeShapes ?? [];
  if (!sameSet(gotShapes, wantShapes)) problems.push(`땅모양 제외 ${gotShapes.join(",") || "(없음)"} (기대 ${wantShapes.join(",") || "(없음)"})`);
  const gotDistricts = r.conditions.districts ?? [];
  const wantDistricts = expected.districts ?? [];
  if (!sameSet(gotDistricts, wantDistricts)) problems.push(`지역 ${gotDistricts.join(",") || "(없음)"} (기대 ${wantDistricts.join(",") || "(없음)"})`);
  return { correct: problems.length === 0, why: problems.join("; ") };
}

/** AI를 한 번 부른다. 연결 오류는 한 번 더 시도하고, 그래도 안 되면 "error" */
async function ask(text: string, client: AiClient): Promise<ParseConditionResponse | "error"> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await parseConditionText(text, client);
    } catch (error) {
      if (!(error instanceof AiError)) throw error;
    }
  }
  return "error";
}

export interface EvalRow {
  c: ConditionCase;
  /** 정확도에 쓰는 첫 번째 호출 */
  first: { correct: boolean; why: string; ms: number };
  /** 첫 호출 포함, 호출마다 맞았는지 (안정성 확인용) */
  runs: boolean[];
}

export interface EvalSummary {
  rows: EvalRow[];
  total: number;
  correct: number;
  rate: number;
  allRunsCorrect: number;
  avgMs: number;
  groups: { name: string; correct: number; total: number }[];
}

/** 문장 세트를 돌린다. 정확도는 첫 번째 호출로, 같은 문장을 extraRuns번 더 불러 안정성도 본다 */
export async function runCases(cases: readonly ConditionCase[], client: AiClient, extraRuns: number): Promise<EvalSummary> {
  const rows: EvalRow[] = [];
  for (const c of cases) {
    const t0 = performance.now();
    const firstResponse = await ask(c.text, client);
    const ms = Math.round(performance.now() - t0);
    const first = { ...judge(c, firstResponse), ms };
    const extra = await Promise.all(Array.from({ length: extraRuns }, () => ask(c.text, client)));
    rows.push({ c, first, runs: [first.correct, ...extra.map((r) => judge(c, r).correct)] });
  }
  const group = (name: string, status: ConditionCase["status"]) => {
    const list = rows.filter((r) => r.c.status === status);
    return { name, correct: list.filter((r) => r.first.correct).length, total: list.length };
  };
  const correct = rows.filter((r) => r.first.correct).length;
  return {
    rows,
    total: rows.length,
    correct,
    rate: correct / rows.length,
    allRunsCorrect: rows.filter((r) => r.runs.every(Boolean)).length,
    avgMs: Math.round(rows.reduce((s, r) => s + r.first.ms, 0) / rows.length),
    groups: [group("정상", "ok"), group("애매함(되묻기)", "need_clarification"), group("지원 안 함", "unsupported")].filter((g) => g.total > 0),
  };
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

/** 화면에 보여줄 글 */
export function renderConsole(title: string, s: EvalSummary, goal: number, runsPerCase: number): string {
  const lines = [`\n${title}: ${s.correct}/${s.total} = ${pct(s.rate)} (목표 ${pct(goal)} 이상) ${s.rate >= goal ? "✅ 통과" : "❌ 미달"}`];
  for (const g of s.groups) lines.push(`  · ${g.name}: ${g.correct}/${g.total}`);
  lines.push(`  · 같은 문장 ${runsPerCase}번 모두 맞음(안정성): ${s.allRunsCorrect}/${s.total}`, `  · 평균 응답 시간 ${s.avgMs}ms`, "");
  for (const { c, first, runs } of s.rows) lines.push(`${first.correct ? "✅" : "❌"} ${runs.filter(Boolean).length}/${runs.length} "${c.text}"${first.correct ? "" : `\n     → ${first.why}`}`);
  return lines.join("\n");
}

/** 결과 파일(마크다운) */
export function renderMarkdown(title: string, s: EvalSummary, goal: number, runsPerCase: number, notes: string[]): string {
  return [
    `# ${title}`,
    "",
    `- 측정 시각: ${new Date().toISOString()}`,
    `- 모델: \`${AI_MODEL}\``,
    `- **정확도: ${s.correct}/${s.total} = ${pct(s.rate)}** (목표 ${pct(goal)} 이상) → ${s.rate >= goal ? "통과" : "미달"}`,
    ...s.groups.map((g) => `  - ${g.name}: ${g.correct}/${g.total}`),
    `- 안정성: 같은 문장을 ${runsPerCase}번씩 불렀을 때 모두 맞은 문장 ${s.allRunsCorrect}/${s.total} (정확도에는 넣지 않음)`,
    `- 평균 응답 시간: ${s.avgMs}ms`,
    "",
    "정확도는 문장마다 첫 번째 호출 결과로 계산했다. 문장과 기대값은 측정 전에 정해 `evals/`의 문장 파일에 고정했다.",
    ...notes.map((n) => `\n> ${n}`),
    "",
    "| # | 문장 | 기대 | 결과 | 호출별 | 비고 |",
    "|--:|---|---|:-:|:-:|---|",
    ...s.rows.map(({ c, first, runs }, i) => `| ${i + 1} | ${c.text} | ${c.status} | ${first.correct ? "✅" : "❌"} | ${runs.filter(Boolean).length}/${runs.length} | ${first.correct ? c.note : first.why} |`),
    "",
  ].join("\n");
}
