@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

명령어·Golden Rules·커밋 컨벤션은 `@AGENTS.md`에 있다. 이 문서는 여러 파일을 읽어야 파악되는 아키텍처 흐름만 다룬다.

## 아키텍처

프롬프트 → AI → 실행 가능한 React 코드 → 실시간 렌더링. 두 개의 독립 프로세스로 구성된다.

### 백엔드 프록시 (`server/`, Bun.serve, 포트 3002)

브라우저에 AI API 키를 노출하지 않기 위한 얇은 프록시 계층. Vite dev 서버가 `/api`를 여기로 프록시한다(`vite.config.ts`). 상세 규칙은 `server/AGENTS.md` 참조.

- **`index.ts`** — HTTP 서버 본체. `GET /api/config`(키 존재 여부만 반환), `POST /api/generate`(`{ prompt, apiKey?, provider }` → **NDJSON 스트림**: `delta`(코드 조각)·`done`(정규화된 최종 `code`)·`error`). provider의 SSE를 `relayStream`이 NDJSON으로 릴레이한다. 공통 `SYSTEM_PROMPT`이 "import 금지 / inline 스타일만 / 말미 `render()` 호출 / TypeScript 금지"를 AI에 강제한다 — react-live 실행 제약과 직결되므로 수정 시 주의.
- **`generator.ts`** — AI 응답을 react-live 실행 가능하게 정규화하는 순수 함수. `stripCodeFences`, `ensureRenderCall`(`render()` 없으면 첫 컴포넌트 찾아 자동 주입).
- **`stream.ts`** — provider SSE를 파싱하는 순수 함수. `parseSSEBuffer`(chunk 경계에 안전한 라인 분리), `parseAnthropicEvent`/`parseGoogleEvent`(텍스트 조각·truncated·error 추출).
- **`fallback.ts`** — `withModelFallback`: 모델을 순서대로 시도해 첫 성공 반환. Google은 여러 Gemini 모델로 폴백한다.

### 프론트엔드 (`src/`, React 19 + Vite)

상세 규칙은 `src/AGENTS.md` 참조.

- **`hooks/useComponentGenerator.ts`** — 상태의 단일 출처. `components[]`(최신순), `isLoading`, `error`, `streamingCode`(생성 중 실시간 코드)를 들고 `/api/generate`의 NDJSON 스트림을 읽는다(`lib/streamParser.ts`의 `parseNdjson`). `delta`를 누적해 `streamingCode`에 반영하고, `done`의 정규화된 `code`로 컴포넌트를 확정한다.
- **`components/LivePreview.tsx`** — `react-live`의 `LiveProvider`를 `noInline` 모드로 사용. 코드에 `render(...)` 호출이 반드시 있어야 미리보기가 그려진다(`ensureRenderCall`가 보장).
- **`App.tsx`** — 최상위 조합. 마운트 시 `/api/config`로 서버 env 키 존재 여부를 확인하고 provider·키 UI를 제어한다.

### 데이터 흐름

`PromptInput` 제출 → `App.handleGenerate`(키 유무 검증) → `useComponentGenerator.generate` → `POST /api/generate` → 서버가 provider SSE를 열고 `relayStream`으로 NDJSON 릴레이 → 클라이언트가 `delta`를 `streamingCode`에 누적(App이 실시간 코드 패널로 표시) → 서버가 `stripCodeFences` → `ensureRenderCall`로 정규화한 최종 `code`를 `done`으로 전송 → `components`에 추가 → `ComponentCard` → `LivePreview`가 즉시 렌더.

생성 중 UI는 `App.tsx`가 `streamingCode`를 IDE풍 코드 패널로 실시간 표시한다. **부분 코드는 실행하지 않는다**(정규화 전 원본). 완료 후 확정된 코드만 `LivePreview`가 실행한다 — "클라이언트에서 곧바로 실행 금지" 골든룰과 일치.

## 핵심 주의점

- **생성되는 컴포넌트 코드는 plain JavaScript**다(TypeScript 문법 금지, react-live 런타임 제약). 프로젝트 소스 자체는 TypeScript다 — 둘을 혼동하지 말 것.
- 테스트는 순수 로직(`server/*.test.ts`)과 UI(`src/**/*.test.tsx`)를 모두 포함하며 환경은 jsdom이다(`vite.config.ts`의 `test` 블록).
