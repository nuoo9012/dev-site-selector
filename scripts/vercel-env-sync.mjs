// Vercel(운영) 환경변수를 .env의 값으로 맞추는 도구: `npm run vercel:env`
// .env에 있는 값을 읽어 Vercel CLI로 등록한다(이미 있으면 덮어씀). 값은 화면·로그에 출력하지 않는다. (Vercel에는 "민감 값"으로 저장)
// 등록할 이름은 아래 NAMES에 적는다. 새 환경변수를 만들면 여기에도 추가한다. (NEXT_PUBLIC_ 이름은 쓰지 않는다)
// 인증: .env의 VERCEL_TOKEN (CLAUDE.md 규칙)

import { spawnSync } from "node:child_process";
import fs from "node:fs";

const NAMES = ["DATABASE_URL", "OPENAI_API_KEY"];

if (fs.existsSync(".env")) process.loadEnvFile(".env");
const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("❌ .env에 VERCEL_TOKEN이 없어요.");
  process.exit(1);
}

let failed = 0;
for (const name of NAMES) {
  const value = process.env[name];
  if (!value) {
    console.error(`⚠️  ${name}: .env에 값이 없어서 건너뜀`);
    failed += 1;
    continue;
  }
  const result = spawnSync("npx", ["vercel", "env", "add", name, "production", "--sensitive", "--force", "--yes", "--token", token], {
    input: value,
    encoding: "utf8",
    timeout: 120_000,
    shell: process.platform === "win32",
  });
  // 출력에 값이나 토큰이 섞여 있어도 보여주지 않고 결과만 알린다
  if (result.status === 0) console.log(`✅ ${name}: Vercel(production)에 등록`);
  else {
    failed += 1;
    console.error(`❌ ${name}: 등록 실패 (종료 번호 ${result.status ?? "시간 초과"})`);
  }
}
process.exit(failed ? 1 : 0);
