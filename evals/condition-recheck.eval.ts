// 지시문 수정 확인용 새 문장 세트 (PLAN 작업 16) — "넘는/초과는 이상, 이하/미만은 지원 안 함" 고침이 처음 보는 문장에서도 맞는지 본다
// 이 6문장은 지시문을 고칠 때 보지 않았고, 기대값은 실행 전에 정해 고정했다. 실행: npm run eval:recheck

import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { getAiClient } from "@/lib/ai";
import type { ConditionCase } from "./condition-cases";
import { renderConsole, renderMarkdown, runCases } from "./condition-runner";

const RECHECK_CASES: ConditionCase[] = [
  { text: "2천㎡를 초과하는 준주거지역", status: "ok", minArea: 2000, landCategories: "default", zones: ["준주거지역"], note: "'초과'는 하한 → 이상으로 처리" },
  { text: "면적이 1만㎡ 넘는 대지", status: "ok", minArea: 10000, landCategories: ["대"], zones: "default", note: "'넘는'은 하한" },
  { text: "최소 면적 800㎡, 일반상업지역", status: "ok", minArea: 800, landCategories: "default", zones: ["일반상업지역"], note: "'최소'" },
  { text: "5천㎡ 미만인 땅", status: "unsupported", note: "상한(미만)은 지원 안 함" },
  { text: "면적 3000 이하 준주거지역", status: "unsupported", note: "상한(이하)은 지원 안 함" },
  { text: "1500㎡ 이상 3000㎡ 이하", status: "unsupported", note: "하한과 상한을 함께 — 상한이 있으므로 지원 안 함" },
];

const EXTRA_RUNS = 2;
const GOAL = 1; // 6문장이라 하나라도 틀리면 눈에 띄게 한다

it("지시문 수정 확인 (새 문장 6개)", async () => {
  process.loadEnvFile(path.resolve(".env"));
  const summary = await runCases(RECHECK_CASES, getAiClient(), EXTRA_RUNS);

  console.log(renderConsole("지시문 수정 확인(새 문장)", summary, GOAL, 1 + EXTRA_RUNS));
  fs.mkdirSync(path.resolve("evals/results"), { recursive: true });
  fs.writeFileSync(
    path.resolve("evals/results/condition-recheck.md"),
    renderMarkdown("지시문 수정 확인 — 새 문장 6개 (독립 점검)", summary, GOAL, 1 + EXTRA_RUNS, [
      "SC-4 정식 측정과 별개로, 지시문 수정(넘는/초과 → 이상, 이하/미만 → 지원 안 함)을 처음 보는 문장으로 확인한 것이다. 문장이 6개뿐이라 정확도 숫자보다 틀린 문장이 무엇인지가 중요하다.",
    ]),
    "utf8",
  );
  expect(summary.rate).toBeGreaterThanOrEqual(GOAL);
});
