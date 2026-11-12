// .env.example 자동 검사 (PLAN 작업 17) — 비밀 값이 없고, 코드가 읽는 환경 변수 이름이 빠짐없이 적혀 있는지 확인한다. 실행: npm test

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const EXAMPLE = fs.readFileSync(path.resolve(".env.example"), "utf8");

/** "이름=값" 줄만 뽑는다 (주석·빈 줄 제외) */
const entries = EXAMPLE.split(/\r?\n/)
  .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
  .map((line) => {
    const i = line.indexOf("=");
    return { name: line.slice(0, i), value: line.slice(i + 1) };
  });

// 코드에서 process.env.이름 으로 읽는 환경 변수를 모은다
function usedEnvNames(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".next", "trash-can"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|mts|mjs)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
        for (const m of fs.readFileSync(full, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) found.add(m[1]);
      }
    }
  };
  for (const dir of ["app", "lib", "scripts", "evals"]) walk(path.resolve(dir));
  return found;
}

// 비밀이 아닌, 개발 중 시험용 스위치와 Next.js가 알아서 정하는 값
const NOT_SECRET_OR_AUTO = new Set(["EXTERNAL_STDR_YEAR", "NODE_ENV", "VERCEL"]);

describe(".env.example", () => {
  it("모든 환경 변수의 값이 비어 있음 (이 파일은 GitHub에 올라가므로 비밀 값이 없어야 함)", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const { name, value } of entries) expect(value, `${name}에 값이 적혀 있어요`).toBe("");
  });

  it("이름 앞에 NEXT_PUBLIC_이 붙은 변수가 없음 (붙으면 브라우저에 노출됨)", () => {
    expect(entries.filter((e) => e.name.startsWith("NEXT_PUBLIC_"))).toEqual([]);
  });

  it("코드가 읽는 환경 변수 이름이 모두 적혀 있음 (새 변수를 쓰고 예시를 빼먹으면 여기서 알려줌)", () => {
    const listed = new Set(entries.map((e) => e.name));
    const missing = [...usedEnvNames()].filter((n) => !NOT_SECRET_OR_AUTO.has(n) && !listed.has(n));
    expect(missing, `.env.example에 없는 환경 변수: ${missing.join(", ")}`).toEqual([]);
  });

  it("필수 변수 OPENAI_API_KEY가 있음", () => {
    expect(entries.map((e) => e.name)).toContain("OPENAI_API_KEY");
  });

  it("진짜 .env에 있는 비밀 값이 이 파일에 섞여 들어가지 않았음", () => {
    const envPath = path.resolve(".env");
    if (!fs.existsSync(envPath)) return; // 배포 서버처럼 .env가 없으면 건너뜀
    const secrets = fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((l) => l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""))
      .filter((v) => v.length >= 12);
    for (const secret of secrets) expect(EXAMPLE.includes(secret), ".env.example에 비밀 값이 들어 있어요").toBe(false);
  });
});
