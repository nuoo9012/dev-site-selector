// 토지소유정보 CSV(data/raw/owner/*.csv, 브이월드 서울) → 데이터베이스 parcels 표의 소유구분 열 채우기
// 실행: npm run load:owners  (먼저 npm run load:db로 필지가 올라가 있어야 한다. 여러 번 실행해도 안전하다)
// 원본에는 소유자 이름이 없고 "소유구분"(국유지·개인 등)과 "국가기관구분"만 있다. 그 둘만 쓴다.
// 접속 주소(DATABASE_URL)는 .env에서만 읽고 출력하지 않는다.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import iconv from "iconv-lite";
import pg from "pg";
import { OWNER_CATEGORIES } from "../lib/conditions.ts";
import { SUPABASE_CA } from "../lib/db-ca.ts";

const OWNER_DIR = path.resolve("data/raw/owner");
const BATCH = 5000;

// 원본 표기 → 앱에서 쓰는 이름 (띄어쓰기를 가운뎃점으로). 목록에 없는 값(일본인 창씨명등, 빈 값)은 건너뛴다.
const OWNER_NAME: Record<string, string> = {
  국유지: "국유지",
  "시 도유지": "시·도유지",
  군유지: "군유지",
  개인: "개인",
  법인: "법인",
  "외국인 외국공공기관": "외국인·외국공공기관",
  종교단체: "종교단체",
  기타단체: "기타단체",
  종중: "종중",
};
const KNOWN = new Set<string>(OWNER_CATEGORIES);

if (fs.existsSync(".env")) process.loadEnvFile(".env");
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL이 없어요. .env에 넣어 주세요. (.env.example 참고)");
  process.exit(1);
}
const connectionString = process.env.DATABASE_URL.replace(/:6543\//, ":5432/");

async function readOwners(file: string) {
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(iconv.decodeStream("cp949")), crlfDelay: Infinity });
  let idx: Record<string, number> | null = null;
  let width = 0;
  const byPnu = new Map<string, { owners: Set<string>; agencies: Set<string> }>();
  let rows = 0;
  let broken = 0; // 이름 안의 쉼표 등으로 칸이 밀린 줄
  let unknownOwner = 0;
  let baseDate = "";

  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, "");
    if (!idx) {
      const header = line.split(",");
      idx = Object.fromEntries(header.map((h, i) => [h, i]));
      width = header.length;
      for (const need of ["고유번호", "소유구분", "국가기관구분", "데이터기준일자"]) {
        if (!(need in idx)) throw new Error(`CSV에 '${need}' 열이 없어요.`);
      }
      continue;
    }
    if (!line) continue;
    const c = line.split(",");
    const pnu = c[idx["고유번호"]] ?? "";
    // 칸 수가 맞지 않으면 열이 밀려 있어 믿을 수 없으므로 건너뛴다
    if (c.length !== width || !/^\d{19}$/.test(pnu)) {
      broken += 1;
      continue;
    }
    rows += 1;
    const owner = OWNER_NAME[c[idx["소유구분"]]];
    if (!owner || !KNOWN.has(owner)) {
      unknownOwner += 1;
      continue;
    }
    const entry = byPnu.get(pnu) ?? { owners: new Set<string>(), agencies: new Set<string>() };
    entry.owners.add(owner);
    const agency = c[idx["국가기관구분"]];
    if (owner === "국유지" && agency && agency !== "구분없음") entry.agencies.add(agency);
    byPnu.set(pnu, entry);
    const date = c[idx["데이터기준일자"]];
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date > baseDate) baseDate = date;
  }
  return { byPnu, rows, broken, unknownOwner, baseDate };
}

async function main() {
  const file = fs.existsSync(OWNER_DIR) ? fs.readdirSync(OWNER_DIR).find((f) => f.toLowerCase().endsWith(".csv")) : undefined;
  if (!file) {
    console.error(`❌ ${OWNER_DIR} 에 소유정보 CSV가 없어요. 브이월드 "토지소유정보"(서울) CSV를 풀어 넣어 주세요.`);
    process.exit(1);
  }

  console.log(`📄 ${file} 읽는 중… (1.5GB라 몇 분 걸려요)`);
  const { byPnu, rows, broken, unknownOwner, baseDate } = await readOwners(path.join(OWNER_DIR, file));
  console.log(`   읽은 줄 ${rows.toLocaleString("ko-KR")}, 필지 ${byPnu.size.toLocaleString("ko-KR")}개, 칸이 밀려 건너뛴 줄 ${broken.toLocaleString("ko-KR")}, 소유구분을 알 수 없는 줄 ${unknownOwner.toLocaleString("ko-KR")}`);
  if (!baseDate) throw new Error("데이터기준일자를 찾지 못했어요.");

  const client = new pg.Client({ connectionString, ssl: SUPABASE_CA ? { ca: SUPABASE_CA } : true });
  await client.connect();
  await client.query(`
    alter table parcels add column if not exists owners text[];
    alter table parcels add column if not exists owner_agency text;
    create index if not exists parcels_owners_idx on parcels using gin (owners);
    create table if not exists source_meta (name text primary key, base_date date not null, row_count integer not null, loaded_at timestamptz not null default now());
    alter table source_meta enable row level security;`);

  // 다시 실행해도 같은 결과가 되도록 먼저 비운다
  await client.query("update parcels set owners = null, owner_agency = null where owners is not null or owner_agency is not null");

  const entries = [...byPnu.entries()];
  let matched = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const result = await client.query(
      `update parcels p set owners = string_to_array(v.owners, ','), owner_agency = nullif(v.agency, '')
         from unnest($1::text[], $2::text[], $3::text[]) as v(pnu, owners, agency)
        where p.pnu = v.pnu`,
      [
        batch.map(([pnu]) => pnu),
        batch.map(([, v]) => [...v.owners].sort().join(",")),
        batch.map(([, v]) => [...v.agencies].sort().join(",")),
      ],
    );
    matched += result.rowCount ?? 0;
    if ((i / BATCH) % 20 === 0) console.log(`   … ${Math.min(i + BATCH, entries.length).toLocaleString("ko-KR")} / ${entries.length.toLocaleString("ko-KR")}`);
  }

  await client.query(
    `insert into source_meta (name, base_date, row_count, loaded_at) values ('owners', $1, $2, now())
     on conflict (name) do update set base_date = excluded.base_date, row_count = excluded.row_count, loaded_at = now()`,
    [baseDate, matched],
  );
  const stats = await client.query<{ total: number; with_owner: number; state: number }>(
    `select count(*)::int as total, count(owners)::int as with_owner, count(*) filter (where '국유지' = any(owners))::int as state from parcels`,
  );
  await client.end();

  const s = stats.rows[0];
  console.log(`\n✅ 완료 — 소유구분이 붙은 필지 ${matched.toLocaleString("ko-KR")}개 (기준일 ${baseDate})`);
  console.log(`   전체 ${s.total.toLocaleString("ko-KR")}필지 중 소유정보 있음 ${s.with_owner.toLocaleString("ko-KR")}, 소유정보 없음 ${(s.total - s.with_owner).toLocaleString("ko-KR")}, 국유지(공유 포함) ${s.state.toLocaleString("ko-KR")}`);
}

main().catch((error) => {
  console.error(`❌ 올리는 중 문제가 생겼어요: ${error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/\S+/g, "***") : "알 수 없는 오류"}`);
  process.exit(1);
});
