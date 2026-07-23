@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

명령어·Golden Rules·커밋 컨벤션은 `@AGENTS.md`에 있다. 이 문서는 여러 파일을 읽어야 파악되는 아키텍처 흐름만 다룬다.

## 아키텍처

프롬프트 → AI → 실행 가능한 React 코드 → 실시간 렌더링. 두 개의 독립 프로세스로 구성된다.

### 백엔드 프록시 (`server/`, Bun.serve, 포트 3002)

브라우저에 AI API 키를 노출하지 않기 위한 얇은 프록시 계층. Vite dev 서버가 `/api`를 여기로 프록시한다(`vite.config.ts`). 상세 규칙은 `server/AGENTS.md` 참조.

- **`index.ts`** — HTTP 서버 본체. `GET /api/config`(키 존재 여부만 반환), `POST /api/generate`(`{ prompt, apiKey?, provider }` → `{ code }`). 공통 `SYSTEM_PROMPT`이 "import 금지 / inline 스타일만 / 말미 `render()` 호출 / TypeScript 금지"를 AI에 강제한다 — react-live 실행 제약과 직결되므로 수정 시 주의.
- **`generator.ts`** — AI 응답을 react-live 실행 가능하게 정규화하는 순수 함수. `stripCodeFences`, `ensureRenderCall`(`render()` 없으면 첫 컴포넌트 찾아 자동 주입).
- **`fallback.ts`** — `withModelFallback`: 모델을 순서대로 시도해 첫 성공 반환. Google은 여러 Gemini 모델로 폴백한다.

### 프론트엔드 (`src/`, React 19 + Vite)

상세 규칙은 `src/AGENTS.md` 참조.

- **`hooks/useComponentGenerator.ts`** — 상태의 단일 출처. `components[]`(최신순), `isLoading`, `error`를 들고 `/api/generate` 호출을 캡슐화한다.
- **`components/LivePreview.tsx`** — `react-live`의 `LiveProvider`를 `noInline` 모드로 사용. 코드에 `render(...)` 호출이 반드시 있어야 미리보기가 그려진다(`ensureRenderCall`가 보장).
- **`App.tsx`** — 최상위 조합. 마운트 시 `/api/config`로 서버 env 키 존재 여부를 확인하고 provider·키 UI를 제어한다.

### 데이터 흐름

`PromptInput` 제출 → `App.handleGenerate`(키 유무 검증) → `useComponentGenerator.generate` → `POST /api/generate` → 서버에서 AI 호출 후 `stripCodeFences` → `ensureRenderCall` → `{ code }` → `components`에 추가 → `ComponentCard` → `LivePreview`가 즉시 렌더.

## 핵심 주의점

- **생성되는 컴포넌트 코드는 plain JavaScript**다(TypeScript 문법 금지, react-live 런타임 제약). 프로젝트 소스 자체는 TypeScript다 — 둘을 혼동하지 말 것.
- 테스트는 순수 로직(`server/*.test.ts`)과 UI(`src/**/*.test.tsx`)를 모두 포함하며 환경은 jsdom이다(`vite.config.ts`의 `test` 블록).
