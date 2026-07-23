# AGENTS.md — server

## Module Context

브라우저에 AI API 키를 노출하지 않기 위한 Bun.serve 프록시(포트 3002). Vite dev가 `/api`를 이곳으로 프록시한다. 엔드포인트는 `/api/config`, `/api/generate` 둘뿐이다.

## Tech Stack & Constraints

- Bun 런타임 API 사용 (`Bun.serve`). Node 전용 API 도입 금지.
- HTTP 호출은 전역 `fetch` 사용. axios 등 HTTP 클라이언트 라이브러리 추가 금지.

## Implementation Patterns

- 키 우선순위: 클라이언트 전송 키 → `.env` 키 → 없으면 400 (`resolveApiKey`).
- provider 분기는 `callAnthropic` / `callGoogle`. 신규 provider는 동일한 시그니처의 함수로 추가하고 공통 `SYSTEM_PROMPT`을 넘긴다.
- 다중 모델 폴백은 `withModelFallback(models, attempt)` 사용 — 첫 성공을 반환하고 전부 실패 시 마지막 에러를 throw한다.
- `generator.ts`의 함수는 부수효과 없는 순수 함수로 유지한다. 테스트 가능성이 이 파일의 존재 이유다.

## Testing Strategy

- `bun run test server/generator.test.ts`, `bun run test server/fallback.test.ts`
- 정규화·폴백 로직은 순수 함수 단위 테스트로 커버한다. 실제 네트워크 호출은 테스트하지 않는다.

## Local Golden Rules

Do:
- AI 응답은 `stripCodeFences` → `ensureRenderCall` 순서로 정규화해 반환한다.
- 모든 응답에 CORS 헤더(`CORS_HEADERS`)를 유지한다.

Don't:
- `SYSTEM_PROMPT` 수정 시 "말미 render() 호출 / import 금지 / TS 문법 금지" 규칙을 제거하지 않는다. 제거하면 프론트 react-live 미리보기가 깨진다.
- 에러 응답에 API 키나 provider 원본 응답 전문을 노출하지 않는다.
