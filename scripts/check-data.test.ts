// 빌드 전 환경 검사(scripts/check-data.mjs) 자동 검사 (PLAN 작업 17, 서울 확장 후 데이터베이스 기준)
// 임시 폴더에서 스크립트를 실제로 실행해 보고, 종료 번호와 안내 문구를 확인한다. 실행: npm test

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve("scripts/check-data.mjs");
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const FAKE_URL = "postgresql://user:secret-pass-123@db.example.com:6543/postgres";

/** 임시 작업 폴더에서 스크립트를 실행한다. 내 PC의 실제 값이 섞이지 않게 환경 변수에서 관련 값을 모두 뺀다. */
function run(options: { dbUrl?: string; openaiKey?: string; env?: string; vercel?: boolean } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-data-"));
  tempDirs.push(dir);
  if (options.env !== undefined) fs.writeFileSync(path.join(dir, ".env"), options.env);
  // (빈 값("")으로 두면 안 된다: 이미 정해진 환경 변수는 .env가 덮어쓰지 않으므로 .env를 읽는 경우를 시험할 수 없다)
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.OPENAI_API_KEY;
  delete env.VERCEL;
  if (options.dbUrl) env.DATABASE_URL = options.dbUrl;
  if (options.openaiKey) env.OPENAI_API_KEY = options.openaiKey;
  if (options.vercel) env.VERCEL = "1";
  const result = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8", env });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

describe("check-data — 정상", () => {
  it("접속 주소가 있으면 통과하고 값은 출력하지 않음", () => {
    const r = run({ dbUrl: FAKE_URL, openaiKey: "dummy" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("✅ DATABASE_URL 확인");
    expect(r.out + r.err).not.toContain("secret-pass-123");
    expect(r.err).toBe("");
  });

  it(".env 파일에 있어도 통과 (내 PC에서는 .env에서 읽으므로)", () => {
    const r = run({ env: `DATABASE_URL=${FAKE_URL}\nOPENAI_API_KEY=dummy\n` });
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    expect(r.out + r.err).not.toContain("secret-pass-123");
  });
});

describe("check-data — 접속 주소가 없을 때", () => {
  it("내 컴퓨터에서는 경고만 하고 빌드는 계속함", () => {
    const r = run({ openaiKey: "dummy" });
    expect(r.code).toBe(0);
    expect(r.err).toContain("DATABASE_URL이 설정되어 있지 않아요");
    expect(r.err).toContain(".env.example");
  });

  it("배포 서버(Vercel)에서는 빌드를 멈추고 해결 방법을 알려줌", () => {
    const r = run({ vercel: true, openaiKey: "dummy" });
    expect(r.code).toBe(1);
    expect(r.err).toContain("빌드를 멈");
    expect(r.err).toContain("DATABASE_URL");
  });
});

describe("check-data — 접속 주소 모양이 틀렸을 때", () => {
  it("postgresql 형태가 아니면 멈춤 (값은 출력하지 않음)", () => {
    const r = run({ dbUrl: "http://not-a-database-secret-xyz" });
    expect(r.code).toBe(1);
    expect(r.err).toContain("모양이 올바르지 않아요");
    expect(r.out + r.err).not.toContain("not-a-database-secret-xyz");
  });

  it("주소 자체가 깨져 있어도 멈춤", () => {
    expect(run({ dbUrl: "%%%깨진값" }).code).toBe(1);
  });
});

describe("check-data — AI 키 경고 (빌드는 멈추지 않음)", () => {
  it("키가 없으면 경고만 하고, 안내에 키 값이 아닌 이름만 나옴", () => {
    const r = run({ dbUrl: FAKE_URL });
    expect(r.code).toBe(0);
    expect(r.err).toContain("OPENAI_API_KEY가 설정되어 있지 않아요");
    expect(r.err).toContain(".env.example");
  });

  it(".env 파일에 키가 있어도 경고가 없음 — 값은 출력하지 않음", () => {
    const secret = "sk-test-should-never-print-123";
    const r = run({ env: `DATABASE_URL=${FAKE_URL}\nOPENAI_API_KEY=${secret}\n` });
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    expect(r.out + r.err).not.toContain(secret);
  });
});
