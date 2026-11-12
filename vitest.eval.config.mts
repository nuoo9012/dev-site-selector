// 정확도 측정(eval) 전용 vitest 설정 (PLAN 작업 16)
// 실제 OpenAI를 부르는 측정(비용 발생)은 평소의 `npm test`에 섞이지 않게 evals/ 폴더에 따로 두고,
// `npm run eval:conditions`, `npm run eval:sample`로만 실행한다.
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.mts";

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["evals/**/*.eval.ts"],
      // 측정 결과를 화면에 그대로 보여준다
      reporters: ["verbose"],
      disableConsoleIntercept: true,
      // 문장을 AI에 여러 번 보내므로 넉넉히 (15분)
      testTimeout: 900_000,
    },
  }),
);
