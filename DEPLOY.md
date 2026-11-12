# 배포 준비·비밀 값 관리 (PLAN 작업 18)

실제 배포는 Part 5에서 한다. 이 문서는 그때 그대로 따라 하면 되도록 미리 정리한 것이다.

## 1. 배포 전 점검 결과 (2026-11-12)

| 항목 | 결과 |
|---|---|
| 자동 테스트 `npm test` | 148개 통과 |
| 타입 검사 `npx tsc --noEmit` | 오류 없음 |
| 코드 검사 `npm run lint` | 문제 없음 |
| 빌드 `npm run build` | 성공 (빌드 전 데이터 검사 자동 실행) |
| 비밀 값 검사 | `.env`·`.env.local`의 값이 프로젝트 파일·빌드 결과물 어디에도 없음 |
| 커밋 대상 검사 | `.env`, `.env.local`, `trash-can/`, `.bkit/`, `data/raw/`는 Git이 추적하지 않음 (`.env.example`만 올라감) |
| 선별 속도 (목표 3초) | 서울 25개 구(898,800필지) 실제 DB 기준: 선별 API 약 1.1~1.5초, 처음 한 번은 접속 준비로 약 3.6초, 엑셀 약 2.3초 (본인 PC, `next start`) |

## 2. Vercel 환경변수

| 이름 | 필요 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | **필수** | 말로 조건 입력(AI)에 사용. 서버 쪽 코드에서만 읽음 |
| `DATABASE_URL` | **필수** | 필지 데이터베이스(Supabase 트랜잭션 풀러, 6543) 접속 주소. 서버 쪽 코드에서만 읽음. 없으면 Vercel 빌드가 멈춤 |
| `VWORLD_API_KEY` | 불필요 | 앱은 쓰지 않음 (개발 중 외부 대조 시험 `npm run eval:external`에만 사용) → Vercel에 등록하지 않아도 됨 |
| `VERCEL_TOKEN` | 내 PC만 | Vercel CLI 인증용. `.env`에서 읽어 쓰고 Vercel 환경변수에는 넣지 않음 |

규칙: 이름 앞에 `NEXT_PUBLIC_`을 붙이지 않는다 (붙이면 브라우저에 노출). 값은 채팅·로그·문서에 적지 않는다.

### 등록 방법 (Part 5에서)
1. Vercel CLI 설치 후, `.env`의 `VERCEL_TOKEN`으로 인증한다 (토큰을 채팅에 붙여넣지 않음).
2. 프로젝트 연결: `vercel link`
3. 키 등록: `vercel env add OPENAI_API_KEY production` → 값 입력 칸에 `.env`의 값을 붙여넣는다 (Preview도 쓰면 `preview`도 같은 방법으로).
4. 확인: `vercel env ls` (이름만 보이고 값은 가려져 있어야 정상)
5. 배포 후 확인: 화면에서 "말로 조건 입력"이 동작하는지, 기본 조건 선별·엑셀이 되는지 본다.

### 배포 때 꼭 확인할 것
- 필지 데이터는 Git이 아니라 데이터베이스에 있다. 배포 전에 `npm run check:db`로 연결과 필지 수를 확인하고, `DATABASE_URL`을 Vercel에 등록한다. 비밀번호가 들어 있는 값이라 채팅에 붙여넣지 않는다.
- 키를 등록하지 않으면 빌드는 되지만 "말로 조건 입력"은 안내 문구만 나온다 (기본 조건 선별·엑셀은 정상).

## 3. 키가 노출되었을 때 (유출 대응 절차)

노출 의심 상황: 키를 채팅·GitHub·스크린샷에 올렸거나, `.env`가 커밋되었거나, OpenAI에서 모르는 사용량이 보일 때.

1. **즉시 폐기**: OpenAI 대시보드 → API keys → 해당 키 삭제(Revoke). 먼저 이것부터 한다 (남은 단계보다 빠르게).
2. **새 키 발급**: 같은 곳에서 새 키를 만든다.
3. **내 PC 교체**: `.env`의 `OPENAI_API_KEY` 값을 새 키로 바꾼다.
4. **Vercel 교체**: `vercel env rm OPENAI_API_KEY production` → `vercel env add OPENAI_API_KEY production`으로 새 값 등록.
5. **다시 배포**: 환경변수는 새로 배포해야 반영된다 (`vercel --prod`).
6. **Git 기록 확인**: `git log -p -S"키의 앞부분 일부"`처럼 기록에 키가 남았는지 본다. 이미 폐기했으므로 기록에 남아 있어도 쓸 수 없지만, 저장소가 공개라면 기록 정리를 따로 상의한다.
7. **사용량 확인**: OpenAI 사용량 화면에서 노출 기간 동안 모르는 호출이 있었는지 본다. 이상하면 한도(Usage limit)를 낮춘다.
8. 같은 일이 생기지 않게 원인을 정리한다 (예: `.gitignore` 확인, 비밀 값 검사 다시 실행).

`VERCEL_TOKEN`이 노출된 경우도 같은 순서다: Vercel 계정 설정에서 토큰 삭제 → 새로 발급 → `.env` 교체.

## 4. 커밋 직전 확인 (CLAUDE.md 규칙)

```bash
git status
git diff --cached --name-only
```

`.env`, `.env.local`, `trash-can/`, `.bkit/`, `data/raw/`가 목록에 없어야 한다.
