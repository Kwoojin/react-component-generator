# AGENTS.md — src

## Module Context

React 19 프론트엔드. `/api` 요청은 Vite 프록시를 통해 백엔드(:3002)로 전달된다. 프론트 단독 실행 시 생성 기능이 동작하지 않는다.

## Tech Stack & Constraints

- 생성/목록 상태의 단일 출처는 `hooks/useComponentGenerator.ts`. UI 컴포넌트가 이 상태를 자체 보관하지 않는다.
- 미리보기는 `react-live`의 `LiveProvider`를 `noInline` 모드로 사용한다.

## Implementation Patterns

- 서버가 반환한 코드는 반드시 `render(<Component/>)` 호출을 포함해야 미리보기가 그려진다 (`noInline` 계약).
- provider 선택과 키 입력 UI는 `App.tsx`에서 제어하고, 마운트 시 `/api/config`로 env 키 존재 여부를 확인한다.
- 새 생성 요청은 `useComponentGenerator.generate`를 통해서만 수행한다.

## Testing Strategy

- `bun run test src/components/PromptInput.test.tsx`
- 환경은 jsdom, 컴포넌트 테스트는 Testing Library 사용 (`src/test/setup.ts`).

## Local Golden Rules

Do:
- 생성 결과·로딩·에러 상태는 훅에서 받아 하위 컴포넌트로 내려준다.

Don't:
- react-live 미리보기에 넣는 코드를 TypeScript로 가정하지 않는다. 런타임은 plain JS만 처리한다.
- API 키를 프론트 상태에 영구 저장하거나 콘솔에 로깅하지 않는다.
