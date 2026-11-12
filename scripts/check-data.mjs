// 빌드 전 환경 검사 (PLAN 작업 17, 서울 확장으로 데이터베이스 기준으로 바뀜)
// 필지 데이터는 이제 코드에 묶이지 않고 데이터베이스(Supabase)에 있다. 그래서 빌드 전에 "접속 주소가 설정돼 있는지"를 본다.
//  - 배포 서버(Vercel)에서 DATABASE_URL이 없으면 빌드를 멈춘다 (필지를 못 읽는 앱이 배포되는 것을 막는다).
//  - 내 컴퓨터에서는 경고만 한다 (화면은 안내 문구를 보여주고, 기본 화면·테스트는 계속 쓸 수 있다).
//  - OPENAI_API_KEY가 없으면 경고만 한다 (말로 조건 입력만 못 쓰고, 나머지는 정상).
// 실행: npm run build 때 자동으로 먼저 돌고(package.json의 prebuild), `npm run check:data`로 직접 돌릴 수도 있다.
// 비밀 값은 읽거나 출력하지 않는다. 환경 변수는 "있는지 없는지"만 본다.
// 배포 서버의 Node 버전을 보장할 수 없어서 TypeScript(.mts)가 아니라 일반 JavaScript로 쓴다.

import fs from "node:fs";

// 내 컴퓨터에서는 .env의 값을 Next.js가 나중에 읽으므로, 여기서도 읽어서 "있는지"만 본다.
if (fs.existsSync(".env") && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env");
  } catch {
    // .env를 읽지 못해도 검사는 계속한다
  }
}

const onVercel = Boolean(process.env.VERCEL);

// ───────────── 1) 데이터베이스 접속 주소 ─────────────
const url = process.env.DATABASE_URL;
if (!url) {
  const lines = [
    "· 내 컴퓨터에서: .env에 DATABASE_URL을 넣어 주세요. (.env.example 참고)",
    "· 배포(Vercel)에서: 프로젝트 환경변수에 DATABASE_URL을 등록하세요. (DEPLOY.md 참고)",
  ];
  if (onVercel) {
    console.error("\n❌ DATABASE_URL이 설정되어 있지 않아요. 필지 데이터를 읽을 수 없어서 빌드를 멈춰요.");
    for (const line of lines) console.error(`   ${line}`);
    console.error("\n위 내용을 해결한 뒤 다시 배포해 주세요.\n");
    process.exit(1);
  }
  console.warn("⚠️  DATABASE_URL이 설정되어 있지 않아요. 빌드는 계속하지만, 이대로는 선별·엑셀이 동작하지 않아요.");
  for (const line of lines) console.warn(`   ${line}`);
} else {
  let shape = "ok";
  try {
    const parsed = new URL(url);
    if (!/^postgres(ql)?:$/.test(parsed.protocol) || !parsed.hostname) shape = "bad";
  } catch {
    shape = "bad";
  }
  if (shape === "bad") {
    console.error("\n❌ DATABASE_URL의 모양이 올바르지 않아요. postgresql://사용자:비밀번호@주소:포트/postgres 형태여야 해요.");
    console.error("\n빌드를 멈췄어요. 위 내용을 해결한 뒤 다시 실행해 주세요.\n");
    process.exit(1);
  }
  console.log("✅ DATABASE_URL 확인 (값은 표시하지 않아요). 실제 연결은 `npm run check:db`로 볼 수 있어요.");
}

// ───────────── 2) (경고만) AI 키가 있는지 ─────────────
if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "⚠️  OPENAI_API_KEY가 설정되어 있지 않아요. 빌드는 계속하지만, 이대로 배포하면 '말로 조건 입력'은 안내 문구만 나오고 쓸 수 없어요. (기본 조건 실행·엑셀은 정상)\n" +
      "   내 컴퓨터는 .env에, 배포는 Vercel 환경변수 설정에 OPENAI_API_KEY를 등록하세요. (.env.example 참고)",
  );
}
