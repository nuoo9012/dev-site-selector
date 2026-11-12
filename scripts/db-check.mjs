// DB 연결 확인 (PLAN 서울 확장): `npm run check:db` — 접속이 되는지, 지금 표에 몇 건이 있는지만 보여준다.
// 접속 주소(DATABASE_URL)는 .env에서만 읽고 출력하지 않는다.

import fs from "node:fs";
import pg from "pg";
import { SUPABASE_CA } from "../lib/db-ca.ts";

if (fs.existsSync(".env")) process.loadEnvFile(".env");
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL이 없어요. .env에 넣어 주세요. (.env.example 참고)");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: SUPABASE_CA ? { ca: SUPABASE_CA } : true }); // 인증서 검증을 켠 채로 접속한다
try {
  await client.connect();
  const version = await client.query("select current_setting('server_version') as v");
  console.log(`✅ DB 연결 성공 (PostgreSQL ${version.rows[0].v})`);
  const exists = await client.query("select to_regclass('public.parcels') as t");
  if (exists.rows[0].t) {
    const count = await client.query("select count(*)::int as n from parcels");
    console.log(`   parcels 표: ${count.rows[0].n.toLocaleString("ko-KR")}건`);
  } else {
    console.log("   parcels 표는 아직 없어요.");
  }
} catch (error) {
  console.error(`❌ DB에 연결하지 못했어요: ${error.code ?? error.name}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
