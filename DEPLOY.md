# Cloudflare 배포 가이드

GitHub에 코드를 올리고, Cloudflare가 그 저장소를 보고 자동으로 배포하는 방식입니다.
한 번만 설정해두면 이후에는 `git push` 할 때마다 알아서 배포됩니다.

## 필요한 것

- GitHub 계정
- Cloudflare 계정 (무료 가입)
- Node.js 22.13 이상, pnpm

> 이 프로젝트는 **pnpm** 전용입니다. `npm install` 을 쓰면 안 됩니다.

---

## 1단계 · GitHub에 올리기

GitHub에서 빈 저장소를 하나 만든 뒤(README 등 아무것도 체크하지 말 것):

```bash
git remote add origin https://github.com/<본인계정>/<저장소이름>.git
git branch -M main
git push -u origin main
```

## 2단계 · Cloudflare 리소스 만들기

Cloudflare 대시보드에서 두 개를 만듭니다.

| 만들 것 | 위치 | 이름 예시 | 메모 |
|---|---|---|---|
| D1 데이터베이스 | Storage & Databases → D1 | `bring-premap-db` | 생성 후 **Database ID** 복사해둘 것 |
| R2 버킷 | R2 Object Storage | `bring-premap-captures` | 촬영 사진 저장용 |

## 3단계 · 저장소 연결

Workers & Pages → **Create** → **Import a repository** → 1단계에서 만든 저장소 선택.

설정값:

| 항목 | 값 |
|---|---|
| Worker 이름 | `bring-premap` |
| 빌드 명령 (Build command) | `pnpm run build` |
| 배포 명령 (Deploy command) | `pnpm run deploy` |

**빌드 환경변수 (Build variables)** 에 2단계에서 만든 실제 값을 넣습니다.

| 이름 | 값 |
|---|---|
| `CF_WORKER_NAME` | `bring-premap` |
| `CF_D1_DATABASE_NAME` | `bring-premap-db` |
| `CF_D1_DATABASE_ID` | 2단계에서 복사한 Database ID |
| `CF_R2_BUCKET_NAME` | `bring-premap-captures` |

이 값을 안 넣으면 가짜 데이터베이스 주소로 빌드돼서 배포는 되지만 DB가 동작하지 않습니다.

## 4단계 · API 키 등록

첫 배포가 끝난 뒤, Worker 설정 → **Variables and Secrets** 에서 **Secret** 타입으로 등록합니다.
빌드 환경변수가 아니라 **Secret** 이어야 합니다.

| 이름 | 용도 |
|---|---|
| `KAKAO_REST_API_KEY` | 카카오 장소 검색 |
| `GEMINI_API_KEY` | AI 인터뷰 / 사진 분류 |
| `OPENAI_API_KEY` | 홈페이지 분석 |
| `BUILDING_REGISTER_API_KEY` | 건축물대장 조회 |
| `SUPABASE_URL` | Supabase 주소 |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase 공개 키 |
| `SUPABASE_SECRET_KEY` | Supabase 비밀 키 |
| `SUPABASE_ADMIN_EMAIL` | 관리자 로그인 계정 |
| `SUPABASE_PHOTO_BUCKET` | 사진 저장 버킷명 |

모델 이름(`GEMINI_MODEL`, `GEMINI_VISION_MODEL`, `OPENAI_MODEL`)은 비밀값이 아니라서
코드에 기본값이 들어 있습니다. 바꾸고 싶을 때만 Secret으로 덮어쓰면 됩니다.

## 5단계 · 데이터베이스 테이블 만들기

배포만 해서는 테이블이 안 생깁니다. 내 PC에서 한 번 실행해줘야 합니다.

```bash
pnpm install
npx wrangler login              # 브라우저로 Cloudflare 로그인

# 실제 D1 주소를 넣어 빌드한 뒤 마이그레이션 적용
CF_D1_DATABASE_NAME=bring-premap-db \
CF_D1_DATABASE_ID=<실제 Database ID> \
pnpm run build
pnpm run db:migrate
```

`drizzle/` 폴더의 SQL 5개가 순서대로 적용됩니다.

---

## 로컬에서 개발할 때

```bash
cp .env.example .env    # 값 채우기
pnpm install
pnpm dev
```

`.env` 는 `.gitignore` 에 걸려 있어서 GitHub에 올라가지 않습니다.

## 자주 겪는 문제

**빌드가 `worker/index.ts doesn't point to an existing file` 로 실패**
`worker/index.ts` 파일 이름이 바뀌었는지 확인하세요.

**`npm ci` 에러**
이 프로젝트는 pnpm 전용입니다. `package-lock.json` 을 다시 만들지 마세요.

**배포는 됐는데 사진 업로드/저장이 안 됨**
3단계 빌드 환경변수(특히 `CF_D1_DATABASE_ID`)와 4단계 Secret이 들어갔는지,
5단계 마이그레이션을 돌렸는지 확인하세요.
