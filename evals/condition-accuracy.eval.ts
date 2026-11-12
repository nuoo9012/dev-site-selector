// 조건 변환 정확도 측정 (PLAN 작업 16, 성공 기준 SC-4: 테스트 문장 20개 중 19개 이상 = 95%)
// 실제 OpenAI를 부른다(소량이라 비용은 1원 미만). 실행: npm run eval:conditions
//  - 정확도(SC-4)는 문장마다 "첫 번째 호출" 결과로 계산한다.
//  - 같은 문장을 2번 더 불러 결과가 얼마나 일정한지(안정성)도 따로 본다. 정확도에는 넣지 않는다.
//  - 결과는 evals/results/condition-accuracy.md에 남긴다.
//
// 주의: 이 20문장은 2026-11-12 1차 측정 뒤 지시문을 고치는 데 쓰였다. 그 뒤의 결과는 "독립적 측정"이 아니라 "퇴보 확인"이다.
//       1차 정식 측정(수정 전)은 evals/results/condition-accuracy-1차-수정전.md에 보관되어 있다.

import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { getAiClient } from "@/lib/ai";
import { CONDITION_CASES } from "./condition-cases";
import { renderConsole, renderMarkdown, runCases } from "./condition-runner";

const EXTRA_RUNS = 2;
const GOAL = 0.95;
const TITLE = "조건 변환 정확도 (SC-4: 20문장 중 95% 이상)";

it(TITLE, async () => {
  process.loadEnvFile(path.resolve(".env")); // 키는 .env에서만 읽는다 (출력하지 않음)
  const summary = await runCases(CONDITION_CASES, getAiClient(), EXTRA_RUNS);

  console.log(renderConsole("조건 변환 정확도", summary, GOAL, 1 + EXTRA_RUNS));
  fs.mkdirSync(path.resolve("evals/results"), { recursive: true });
  fs.writeFileSync(
    path.resolve("evals/results/condition-accuracy.md"),
    renderMarkdown("조건 변환 정확도 측정 결과 (SC-4) — 지시문 수정 후 재측정", summary, GOAL, 1 + EXTRA_RUNS, [
      "이 20문장은 1차 정식 측정 뒤 지시문을 고치는 데 쓰였으므로, 이 결과는 독립적 측정이 아니라 퇴보 확인이다. 1차 정식 측정(수정 전)은 `condition-accuracy-1차-수정전.md`를 본다.",
    ]),
    "utf8",
  );
  expect(summary.rate).toBeGreaterThanOrEqual(GOAL);
});
