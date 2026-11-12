// 선별 질의가 DB에서 얼마나 걸리는지 보는 개발용 도구: `node scripts/db-explain.mjs`
// 기본 조건으로 실제 질의를 EXPLAIN ANALYZE로 실행해 걸린 시간과 방식(색인을 쓰는지)을 보여준다. 값은 출력하지 않는다.

import fs from "node:fs";
import pg from "pg";
import { SUPABASE_CA } from "../lib/db-ca.ts";

if (fs.existsSync(".env")) process.loadEnvFile(".env");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { ca: SUPABASE_CA } });
await client.connect();
const t0 = performance.now();
await client.query("select 1");
console.log(`연결 후 왕복 1회: ${Math.round(performance.now() - t0)}ms`);

const sql = `select pnu, sigungu, address, jibun, land_category, area, zone1, zone2
  from parcels
 where (land_category is null or land_category = any($1::text[]))
   and (area is null or area >= $2)
   and (zone1 is null or zone1 = any($3::text[]))
 order by area desc nulls last, pnu
 limit $4`;
const params = [["대"], 1000, ["일반상업지역", "준주거지역", "제3종일반주거지역"], 200001];
const t1 = performance.now();
const r = await client.query(sql, params);
console.log(`질의 전체(받기 포함): ${Math.round(performance.now() - t1)}ms, ${r.rows.length}건`);
const plan = await client.query(`explain (analyze, buffers) ${sql.replace(/\$(\d)/g, (_, n) => `$${n}`)}`, params);
for (const row of plan.rows) console.log(row["QUERY PLAN"]);
await client.end();
