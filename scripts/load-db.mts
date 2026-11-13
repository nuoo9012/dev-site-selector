// 원본 토지특성 DBF(data/raw/*.dbf, 서울 25개 구) → 데이터베이스(Supabase) 올리기
// 실행: npm run load:db   (원본이 바뀌면 다시 실행. 같은 고유번호는 덮어쓰므로 여러 번 실행해도 안전하다)
// 접속 주소(DATABASE_URL)는 .env에서만 읽고 출력하지 않는다. 대량 입력이라 세션 방식 접속(5432)을 쓴다.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { SUPABASE_CA } from "../lib/db-ca.ts";
import { SIGUNGU_BY_CODE, type Parcel } from "../lib/types.ts";
import { readDbf, toParcel } from "./dbf.mts";

const RAW_DIR = path.resolve("data/raw");
const BATCH = 5000;

if (fs.existsSync(".env")) process.loadEnvFile(".env");
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL이 없어요. .env에 넣어 주세요. (.env.example 참고)");
  process.exit(1);
}
// 대량 입력은 풀러의 세션 방식(5432)으로 접속한다
const connectionString = process.env.DATABASE_URL.replace(/:6543\//, ":5432/");

const SCHEMA = `
create table if not exists parcels (
  pnu            char(19) primary key,
  sigungu        text not null,
  address        text not null,
  jibun          text not null,
  land_category  text,
  area           double precision,
  zone1          text,
  zone2          text,
  owners         text[],
  owner_agency   text,
  land_use       text,
  land_shape     text
);
alter table parcels add column if not exists land_use text;
alter table parcels add column if not exists land_shape text;
alter table parcels add column if not exists owners text[];
alter table parcels add column if not exists owner_agency text;
create index if not exists parcels_owners_idx on parcels using gin (owners);
create table if not exists source_meta (
  name       text primary key,
  base_date  date not null,
  row_count  integer not null,
  loaded_at  timestamptz not null default now()
);
alter table source_meta enable row level security;
create index if not exists parcels_filter_idx on parcels (land_category, zone1, area);
create index if not exists parcels_sigungu_idx on parcels (sigungu);
-- 주소로 필지 찾기(공백 뺀 지번으로 비교)를 빠르게 한다
create index if not exists parcels_jibun_key_idx on parcels ((replace(jibun, ' ', '')));
create table if not exists parcel_meta (
  sigungu     text primary key,
  base_date   date not null,
  parcel_count integer not null,
  loaded_at   timestamptz not null default now()
);
-- 이 표들은 서버(DATABASE_URL)에서만 읽는다. 공개 API(PostgREST)로는 아무도 못 읽게 막아 둔다.
alter table parcels enable row level security;
alter table parcel_meta enable row level security;
`;

async function insertBatch(client: pg.Client, rows: Parcel[]) {
  await client.query(
    `insert into parcels (pnu, sigungu, address, jibun, land_category, area, zone1, zone2, land_use, land_shape)
     select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::float8[], $7::text[], $8::text[], $9::text[], $10::text[])
     on conflict (pnu) do update set sigungu = excluded.sigungu, address = excluded.address, jibun = excluded.jibun,
       land_category = excluded.land_category, area = excluded.area, zone1 = excluded.zone1, zone2 = excluded.zone2,
       land_use = excluded.land_use, land_shape = excluded.land_shape`,
    [
      rows.map((r) => r.pnu),
      rows.map((r) => r.sigungu),
      rows.map((r) => r.address),
      rows.map((r) => r.jibun),
      rows.map((r) => r.landCategory),
      rows.map((r) => r.area),
      rows.map((r) => r.zone1),
      rows.map((r) => r.zone2),
      rows.map((r) => r.landUse ?? null),
      rows.map((r) => r.landShape ?? null),
    ],
  );
}

async function main() {
  const files = fs.existsSync(RAW_DIR) ? fs.readdirSync(RAW_DIR).filter((f) => f.toLowerCase().endsWith(".dbf")).sort() : [];
  if (!files.length) {
    console.error(`❌ ${RAW_DIR} 에 .dbf 파일이 없어요. data/README.md 안내대로 넣어 주세요.`);
    process.exit(1);
  }

  const client = new pg.Client({ connectionString, ssl: SUPABASE_CA ? { ca: SUPABASE_CA } : true });
  await client.connect();
  await client.query(SCHEMA);

  const baseDates: Record<string, string> = {};
  const counts: Record<string, number> = {};
  let total = 0;
  let skipped = 0;

  for (const file of files) {
    const seen = new Set<string>(); // 한 파일 안에서 같은 고유번호가 겹치면 마지막 값만 쓴다
    const rows = new Map<string, Parcel>();
    const { encoding } = readDbf(path.join(RAW_DIR, file), (rec) => {
      const converted = toParcel(rec);
      if (!converted) {
        skipped += 1;
        return;
      }
      const { parcel, baseDate } = converted;
      rows.set(parcel.pnu, parcel);
      seen.add(parcel.pnu);
      if (/^\d{4}-\d{2}-\d{2}$/.test(baseDate) && baseDate > (baseDates[parcel.sigungu] ?? "")) baseDates[parcel.sigungu] = baseDate;
    });

    const list = [...rows.values()];
    await client.query("begin");
    for (let i = 0; i < list.length; i += BATCH) await insertBatch(client, list.slice(i, i + BATCH));
    await client.query("commit");

    for (const p of list) counts[p.sigungu] = (counts[p.sigungu] ?? 0) + 1;
    total += list.length;
    console.log(`📄 ${file} → ${list.length.toLocaleString("ko-KR")}필지 올림 (인코딩: ${encoding === "cp949" ? "EUC-KR" : "UTF-8"})`);
  }

  // 구별 기준일·건수 기록 (화면 머리글과 엑셀 상단에 쓴다)
  for (const gu of Object.values(SIGUNGU_BY_CODE)) {
    if (!baseDates[gu]) continue;
    await client.query(
      `insert into parcel_meta (sigungu, base_date, parcel_count, loaded_at) values ($1, $2, $3, now())
       on conflict (sigungu) do update set base_date = excluded.base_date, parcel_count = excluded.parcel_count, loaded_at = now()`,
      [gu, baseDates[gu], counts[gu] ?? 0],
    );
  }

  const missing = Object.values(SIGUNGU_BY_CODE).filter((gu) => !baseDates[gu]);
  const dbTotal = await client.query("select count(*)::int as n from parcels");
  await client.end();

  console.log(`\n✅ 완료 — 이번에 ${total.toLocaleString("ko-KR")}필지, 데이터베이스 전체 ${dbTotal.rows[0].n.toLocaleString("ko-KR")}필지`);
  if (missing.length) console.log(`  ⚠️ 자료가 없는 구: ${missing.join(", ")}`);
  if (skipped) console.log(`  ℹ️ 대상 구가 아니거나 고유번호가 잘못된 행 ${skipped}건은 건너뛰었어요.`);
}

main().catch((error) => {
  console.error(`❌ 올리는 중 문제가 생겼어요: ${error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/\S+/g, "***") : "알 수 없는 오류"}`);
  process.exit(1);
});
