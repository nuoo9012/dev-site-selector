// 표본 선별 정확도 측정 (PLAN 작업 16, 성공 기준 SC-3: 담당자가 고른 표본 50건 중 90% 이상이 후보에 포함)
// AI를 쓰지 않으므로 비용이 없다. 실행: npm run eval:sample
// 표본 파일(data/sample/sample.csv)이 없으면 "건너뜀"으로 표시하고 안내만 보여준다.

import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { DEFAULT_CONDITIONS } from "@/lib/conditions";
import { PARCEL_DATA } from "@/lib/parcels";
import { checkSample, decodeCsv, formatSampleReport, parseSampleCsv } from "@/lib/sample-check";

const SAMPLE_FILE = path.resolve("data/sample/sample.csv");
const GOAL = { total: 50, rate: 0.9 };
const exists = fs.existsSync(SAMPLE_FILE);

if (!exists) {
  console.log(
    [
      "",
      "표본 파일이 아직 없어서 선별 정확도(SC-3)는 측정하지 않았어요.",
      "  1) data/sample/template.csv를 복사해 data/sample/sample.csv로 저장하세요.",
      "  2) 담당자가 직접 고른 후보 필지 50건을 \"구, 동, 지번\"으로 적으세요.",
      "  3) 다시 npm run eval:sample 을 실행하세요.",
      "  자세한 방법: data/sample/README.md",
      "",
    ].join("\n"),
  );
}

it.skipIf(!exists)("선별 정확도 (SC-3: 표본 50건 중 90% 이상이 후보에 포함)", () => {
  const { rows, problems } = parseSampleCsv(decodeCsv(fs.readFileSync(SAMPLE_FILE)));
  if (problems.length) console.log(`\n표본 파일에서 읽지 못한 부분:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  expect(rows.length, "표본 파일에서 읽은 필지가 하나도 없어요. 위 안내를 확인해 주세요.").toBeGreaterThan(0);

  const report = checkSample(rows, PARCEL_DATA.parcels, DEFAULT_CONDITIONS);
  const text = formatSampleReport(report, DEFAULT_CONDITIONS, GOAL);
  console.log(`\n${text}\n`);

  // 결과를 파일에도 남긴다
  fs.mkdirSync(path.resolve("evals/results"), { recursive: true });
  fs.writeFileSync(
    path.resolve("evals/results/sample-accuracy.md"),
    `# 선별 정확도 측정 결과 (SC-3)\n\n- 측정 시각: ${new Date().toISOString()}\n- 데이터 기준일: ${JSON.stringify(PARCEL_DATA.meta.baseDates)}\n\n\`\`\`\n${text}\n\`\`\`\n`,
    "utf8",
  );

  expect(report.total, `표본은 ${GOAL.total}건이 기준이에요`).toBeGreaterThan(0);
  expect(report.rate).toBeGreaterThanOrEqual(GOAL.rate);
});
