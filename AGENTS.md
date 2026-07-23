# AGENTS.md

## Operational Commands

패키지 매니저는 Bun 고정. npm/yarn/pnpm 사용 금지 (`bun.lock`).

- `bun install` — 의존성 설치
- `bun run dev` — API 서버(:3002) + Vite(:5173) 동시 실행. 개발 시 항상 이것으로 두 프로세스를 함께 띄운다.
- `bun run server` — API 서버 단독 (bun --watch)
- `bun run build` — `tsc -b` 타입체크 후 `vite build`
- `bun run lint` — ESLint
- `bun run test` — 전체 테스트 1회 (vitest run)
- `bun run test:watch` — watch 모드
- `bun run test <path>` — 단일 파일 실행
- `bun run test -t "<이름>"` — 이름으로 단일 테스트 실행

프론트엔드를 단독 실행하면 `/api/*` 프록시 대상(백엔드)이 없어 생성 기능이 동작하지 않는다.

## Golden Rules

Immutable:
- API 키를 코드/커밋에 하드코딩하지 않는다. 키는 `.env`(gitignore 대상) 또는 UI 입력으로만 주입한다.
- `GET /api/config`는 키의 존재 여부(boolean)만 반환하고 키 값 자체를 응답에 담지 않는다.
- AI 응답을 클라이언트에서 곧바로 실행하지 않는다. 반드시 서버 정규화(`stripCodeFences` → `ensureRenderCall`)를 거친다.

Do:
- 새 AI provider는 공식 REST 엔드포인트를 직접 호출하고 공통 `SYSTEM_PROMPT`을 재사용한다.
- 외부 API 오류는 HTTP 상태코드를 사용자용 한국어 메시지로 변환해 반환한다.

Don't:
- 생성되는 컴포넌트 코드에 TypeScript 문법을 허용하지 않는다 (react-live 런타임 제약). 프로젝트 소스 자체는 TS다 — 혼동 금지.
- `SYSTEM_PROMPT`의 react-live 계약(import 금지 / inline 스타일 / 말미 `render()` 호출)을 임의로 완화하지 않는다.

## Project Context

프롬프트를 입력하면 AI(Anthropic Claude / Google Gemini)가 React 컴포넌트를 생성하고, react-live로 실시간 미리보기와 코드를 제공하는 웹앱.

Tech Stack: React 19, TypeScript, Vite, Bun(서버 런타임 겸 패키지 매니저), react-live, Vitest.

## Standards & References

- 커밋: `<타입>: <한국어 요약>` (feat/fix/refactor/chore/docs/test/style), 50자 이내, 마침표 없음. 관련 없는 변경은 커밋을 분리한다.
- 상세 아키텍처와 데이터 흐름은 `./CLAUDE.md` 참조.
- Maintenance Policy: 규칙과 코드가 어긋나면 해당 `AGENTS.md` 업데이트를 먼저 제안한다.

## Context Map

- **[백엔드 AI 프록시 (Bun)](./server/AGENTS.md)** — API 서버, provider 연동, AI 응답 정규화 로직 수정 시.
- **[프론트엔드 (React/Vite)](./src/AGENTS.md)** — UI 컴포넌트, 상태 훅, react-live 미리보기 수정 시.
