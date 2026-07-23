# AGENTS.md — server

## Module Context

브라우저에 AI API 키를 노출하지 않기 위한 Bun.serve 프록시(포트 3002). Vite dev가 `/api`를 이곳으로 프록시한다. 엔드포인트는 `/api/config`, `/api/generate` 둘뿐이다. `/api/generate`는 provider의 SSE를 읽어 **NDJSON 스트림**(`delta`/`done`/`error`)으로 릴레이한다.

## Tech Stack & Constraints

- Bun 런타임 API 사용 (`Bun.serve`). Node 전용 API 도입 금지.
- HTTP 호출은 전역 `fetch` 사용. axios 등 HTTP 클라이언트 라이브러리 추가 금지.

## Implementation Patterns

- 키 우선순위: 클라이언트 전송 키 → `.env` 키 → 없으면 400 (`resolveApiKey`).
- provider 분기는 `streamAnthropic` / `streamGoogle`. 두 함수는 `stream:true`/`alt=sse`로 SSE 응답(`Response`)을 열고 `!ok`면 throw한다. 신규 provider는 동일 시그니처(`Promise<Response>`)로 추가하고 공통 `SYSTEM_PROMPT`을 넘긴다.
- 다중 모델 폴백은 `withModelFallback(models, attempt)` 사용 — 스트림 **수립 시점**(첫 바이트 전)에 첫 성공 `Response`를 반환하므로 폴백이 깔끔히 동작한다.
- SSE→NDJSON 변환은 `relayStream(aiResponse, parseEvent)`가 담당한다. provider별 SSE 파싱은 `stream.ts`의 순수 함수(`parseSSEBuffer`/`parseAnthropicEvent`/`parseGoogleEvent`)로 분리해 단위 테스트한다.
- `generator.ts`·`stream.ts`의 함수는 부수효과 없는 순수 함수로 유지한다. 테스트 가능성이 이 파일들의 존재 이유다.

## Testing Strategy

- `bun run test server/generator.test.ts`, `bun run test server/fallback.test.ts`, `bun run test server/stream.test.ts`
- 정규화·폴백·SSE 파싱 로직은 순수 함수 단위 테스트로 커버한다. 실제 네트워크 호출과 `relayStream`(스트림 부수효과)은 테스트하지 않는다.

## Local Golden Rules

Do:
- 실제 실행되는 코드(`done`의 `code`)만 `stripCodeFences` → `ensureRenderCall`로 정규화해 딱 한 번 보낸다. `delta`는 실시간 표시 전용(정규화 전 원본)이며 클라이언트에서 실행하지 않는다.
- 모든 응답에 CORS 헤더(`CORS_HEADERS`)를 유지한다. 스트림 응답에는 `Cache-Control: no-cache`도 함께 둔다.

Don't:
- `SYSTEM_PROMPT` 수정 시 "말미 render() 호출 / import 금지 / TS 문법 금지" 규칙을 제거하지 않는다. 제거하면 프론트 react-live 미리보기가 깨진다.
- 에러 응답에 API 키나 provider 원본 응답 전문을 노출하지 않는다.
