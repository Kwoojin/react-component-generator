// AI provider의 SSE 스트림을 파싱하는 순수 함수들.
// 부수효과(fetch, 스트림 읽기)가 없어 단위 테스트가 가능하다.
// index.ts의 스트림 릴레이가 이 함수들을 조합해 사용한다.

export interface SSEParseResult {
  /** 이 이벤트가 담고 있는 생성 텍스트 조각(없으면 빈 문자열). */
  text: string;
  /** 출력이 토큰 한도로 잘렸는지 여부. */
  truncated: boolean;
  /** provider가 스트림 도중 보고한 오류 메시지(없으면 null). */
  error: string | null;
}

const EMPTY: SSEParseResult = { text: '', truncated: false, error: null };

/**
 * SSE 텍스트 버퍼에서 완결된 `data:` 라인들의 payload를 뽑고,
 * 마지막 개행 이후의 미완결 조각은 remainder로 돌려준다.
 * chunk 경계에서 라인이 잘려도 remainder를 다음 chunk 앞에 이어붙이면 된다.
 */
export function parseSSEBuffer(buffer: string): { payloads: string[]; remainder: string } {
  const lastNewline = buffer.lastIndexOf('\n');
  if (lastNewline === -1) {
    return { payloads: [], remainder: buffer };
  }

  const complete = buffer.slice(0, lastNewline);
  const remainder = buffer.slice(lastNewline + 1);

  const payloads: string[] = [];
  for (const line of complete.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      payloads.push(trimmed.slice('data:'.length).trim());
    }
  }
  return { payloads, remainder };
}

interface AnthropicStreamEvent {
  type?: string;
  delta?: { type?: string; text?: string; stop_reason?: string };
  error?: { message?: string };
}

/** Anthropic messages 스트림의 `data:` payload를 해석한다. */
export function parseAnthropicEvent(payload: string): SSEParseResult {
  let evt: AnthropicStreamEvent;
  try {
    evt = JSON.parse(payload) as AnthropicStreamEvent;
  } catch {
    return EMPTY;
  }
  if (!evt || typeof evt !== 'object') return EMPTY;

  if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
    return { text: evt.delta.text ?? '', truncated: false, error: null };
  }
  if (evt.type === 'message_delta' && evt.delta?.stop_reason === 'max_tokens') {
    return { text: '', truncated: true, error: null };
  }
  if (evt.type === 'error') {
    return { text: '', truncated: false, error: evt.error?.message ?? 'Unknown error' };
  }
  return EMPTY;
}

interface GoogleStreamEvent {
  error?: { message?: string };
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
}

/** Google Gemini streamGenerateContent(alt=sse)의 `data:` payload를 해석한다. */
export function parseGoogleEvent(payload: string): SSEParseResult {
  let data: GoogleStreamEvent;
  try {
    data = JSON.parse(payload) as GoogleStreamEvent;
  } catch {
    return EMPTY;
  }
  if (!data || typeof data !== 'object') return EMPTY;

  if (data.error) {
    return { text: '', truncated: false, error: data.error.message ?? 'Unknown error' };
  }

  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((part) => part.text ?? '').join('') : '';
  const truncated = candidate?.finishReason === 'MAX_TOKENS';
  return { text, truncated, error: null };
}
