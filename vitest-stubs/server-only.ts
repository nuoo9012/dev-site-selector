// 자동 검사(vitest)에서 `import "server-only"`를 그냥 통과시키기 위한 빈 파일
// 실제 앱(Next.js)에서는 이 줄이 "브라우저 코드가 서버 전용 파일을 가져오면 빌드 오류"로 동작한다.
export {};
