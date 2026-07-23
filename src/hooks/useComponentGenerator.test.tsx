import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';

// 문자열 chunk 배열을 브라우저 fetch가 주는 것과 같은 ReadableStream으로 만든다.
function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

type MockResponse = {
  ok: boolean;
  body?: ReadableStream<Uint8Array>;
  json?: () => Promise<unknown>;
};

function mockFetch(response: MockResponse) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response as unknown as Response),
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useComponentGenerator 스트리밍', () => {
  it('delta로 조각을 받고 done의 code로 컴포넌트를 추가한다 (chunk 경계 분할 포함)', async () => {
    mockFetch({
      ok: true,
      body: streamFromChunks([
        '{"type":"delta","text":"const A = () => null;"}\n{"type":"do',
        'ne","code":"const A = () => null;\\nrender(<A />);"}\n',
      ]),
    });

    const { result } = renderHook(() => useComponentGenerator());
    await act(async () => {
      await result.current.generate('버튼', undefined, 'google');
    });

    expect(result.current.components).toHaveLength(1);
    expect(result.current.components[0].code).toBe('const A = () => null;\nrender(<A />);');
    expect(result.current.components[0].prompt).toBe('버튼');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.streamingCode).toBe('');
  });

  it('스트림 error 이벤트를 error 상태로 노출하고 컴포넌트를 추가하지 않는다', async () => {
    mockFetch({
      ok: true,
      body: streamFromChunks(['{"type":"error","error":"너무 김"}\n']),
    });

    const { result } = renderHook(() => useComponentGenerator());
    await act(async () => {
      await result.current.generate('x', undefined, 'google');
    });

    expect(result.current.error).toBe('너무 김');
    expect(result.current.components).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
  });

  it('HTTP 오류 응답의 error 메시지를 노출한다', async () => {
    mockFetch({
      ok: false,
      json: async () => ({ error: 'API 키가 필요합니다.' }),
    });

    const { result } = renderHook(() => useComponentGenerator());
    await act(async () => {
      await result.current.generate('x', undefined, 'anthropic');
    });

    expect(result.current.error).toBe('API 키가 필요합니다.');
    expect(result.current.components).toHaveLength(0);
  });
});
