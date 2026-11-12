// 자동 검사(vitest) 설정
// - "@/lib/..." 경로를 앱 코드와 똑같이 읽는다 (tsconfig.json의 paths와 같은 규칙)
// - `import "server-only"`는 검사에서는 그냥 통과시킨다 (vitest-stubs/server-only.ts)
// - trash-can 폴더는 지울 파일을 잠시 옮겨 두는 곳이라 검사 대상에서 뺀다 (CLAUDE.md 파일 삭제 규칙)
import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      "server-only": path.resolve(import.meta.dirname, "vitest-stubs/server-only.ts"),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "trash-can/**"],
  },
});
