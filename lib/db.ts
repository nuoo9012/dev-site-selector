// 데이터베이스(Supabase Postgres) 접속 — 서버 쪽 전용
// 접속 주소(DATABASE_URL)는 환경변수에서만 읽고, 로그나 오류 응답에 내보내지 않는다.
// 이 파일은 화면(브라우저) 코드에서 가져오면 빌드가 멈추도록 server-only로 막아 둔다.

import "server-only";
import pg from "pg";
import { SUPABASE_CA } from "./db-ca";

/** DB 문제를 화면용 오류 코드로 알리는 오류 (원래 오류 내용은 담지 않는다) */
export class DbError extends Error {
  constructor(readonly code: "DB_UNAVAILABLE") {
    super(code);
    this.name = "DbError";
  }
}

let pool: pg.Pool | undefined;

/** 접속 묶음(pool)을 한 번만 만들어 재사용한다. 서버리스에서는 작게(최대 3개) 둔다. */
export function getPool(): pg.Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[db] DATABASE_URL이 설정되어 있지 않아요 (.env 또는 Vercel 환경변수를 확인하세요)");
    throw new DbError("DB_UNAVAILABLE");
  }
  pool = new pg.Pool({
    connectionString,
    // 인증서 검증을 켠 채로 접속한다 (Supabase 공개 인증서를 함께 둠)
    ssl: SUPABASE_CA ? { ca: SUPABASE_CA } : true,
    max: 3,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 20_000,
  });
  // 유휴 연결 오류로 서버가 멈추지 않게 종류만 남긴다
  pool.on("error", (error) => console.error(`[db] 연결 오류: ${(error as NodeJS.ErrnoException).code ?? error.name}`));
  return pool;
}
