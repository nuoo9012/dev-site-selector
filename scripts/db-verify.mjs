// DB에 올린 데이터가 맞는지 확인하는 개발용 도구: `node scripts/db-verify.mjs`
// 1) 기본 조건의 후보·확인 필요 건수를 SQL로 직접 센다 (앱의 선별 결과와 같아야 한다)
// 2) 이전에 정리했던 영등포구·도봉구 기준값(후보 589 · 확인 필요 50)과 같은지 본다
// 3) 구별 건수와 빈 값 비율을 본다

import fs from "node:fs";
import pg from "pg";
import { SUPABASE_CA } from "../lib/db-ca.ts";

if (fs.existsSync(".env")) process.loadEnvFile(".env");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { ca: SUPABASE_CA } });
await client.connect();

const ZONES = ["일반상업지역", "준주거지역", "제3종일반주거지역"];
const COUNT = `
  select
    count(*) filter (where land_category = '대' and area >= 1000 and zone1 = any($1)) ::int as candidates,
    count(*) filter (where (land_category is null or land_category = '대') and (area is null or area >= 1000) and (zone1 is null or zone1 = any($1))
                       and (land_category is null or area is null or zone1 is null)) ::int as needs_check
  from parcels`;

const seoul = (await client.query(COUNT, [ZONES])).rows[0];
console.log("서울 전체 (기본 조건):", seoul);
const two = (await client.query(COUNT + " where sigungu in ('영등포구','도봉구')", [ZONES])).rows[0];
console.log("영등포구+도봉구만:", two, "(기준값: 후보 589 · 확인 필요 50)");

const perGu = await client.query(`select sigungu, count(*)::int n, count(*) filter (where land_category is null)::int no_cat,
  count(*) filter (where area is null)::int no_area, count(*) filter (where zone1 is null)::int no_zone from parcels group by 1 order by 1`);
console.table(perGu.rows);
const size = await client.query("select pg_size_pretty(pg_total_relation_size('parcels')) as s");
console.log("parcels 표 크기(색인 포함):", size.rows[0].s);
await client.end();
