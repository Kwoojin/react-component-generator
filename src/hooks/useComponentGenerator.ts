import { useState, useCallback, useEffect } from 'react';
import type { GeneratedComponent, Provider } from '../types';
import { loadComponents, saveComponents } from '../lib/componentStorage';
import { parseNdjson } from '../lib/streamParser';

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  isLoading: boolean;
  error: string | null;
  /** 생성 중인 컴포넌트 코드. delta가 도착할 때마다 누적되어 실시간 표시에 쓰인다. */
  streamingCode: string;
  generate: (prompt: string, apiKey: string | undefined, provider: Provider) => Promise<void>;
  removeComponent: (id: string) => void;
  clearAll: () => void;
}

export function useComponentGenerator(): UseComponentGeneratorReturn {
  const [components, setComponents] = useState<GeneratedComponent[]>(loadComponents);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingCode, setStreamingCode] = useState('');

  // components가 바뀔 때마다 localStorage에 저장한다.
  // 생성·삭제·전체삭제가 모두 이 상태를 거치므로 한 곳에서 영속화가 보장된다.
  useEffect(() => {
    saveComponents(components);
  }, [components]);

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider) => {
    setIsLoading(true);
    setError(null);
    setStreamingCode('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      // 생성 시작 전 검증 오류(키/프롬프트 누락, provider 오류)는 JSON으로 온다.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate component');
      }
      if (!res.body) {
        throw new Error('스트리밍 응답을 받을 수 없습니다.');
      }

      // 성공 응답은 NDJSON 스트림. delta로 코드가 실시간으로 흘러오고,
      // 마지막에 서버가 정규화한 최종 code(done) 또는 error가 도착한다.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let finalCode: string | null = null;
      let streamError: string | null = null;

      const applyEvents = (chunk: string) => {
        buffer += chunk;
        const { events, remainder } = parseNdjson(buffer);
        buffer = remainder;
        for (const event of events) {
          if (event.type === 'delta') {
            accumulated += event.text;
            setStreamingCode(accumulated);
          } else if (event.type === 'done') {
            finalCode = event.code;
          } else if (event.type === 'error') {
            streamError = event.error;
          }
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        applyEvents(decoder.decode(value, { stream: true }));
      }
      // 스트림 종료 후 남은 미완결 조각을 마지막으로 flush한다.
      const tail = buffer + decoder.decode();
      if (tail.trim()) {
        buffer = '';
        applyEvents(tail.endsWith('\n') ? tail : `${tail}\n`);
      }

      if (streamError) {
        throw new Error(streamError);
      }
      if (finalCode === null) {
        throw new Error('생성이 완료되지 않았습니다.');
      }

      const newComponent: GeneratedComponent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        prompt,
        code: finalCode,
        createdAt: new Date(),
      };

      setComponents((prev) => [newComponent, ...prev]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setIsLoading(false);
      setStreamingCode('');
    }
  }, []);

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setComponents([]);
  }, []);

  return { components, isLoading, error, streamingCode, generate, removeComponent, clearAll };
}
