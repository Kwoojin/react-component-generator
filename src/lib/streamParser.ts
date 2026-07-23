// 서버가 보내는 NDJSON 스트림(한 줄에 JSON 객체 하나)을 파싱하는 순수 함수.
// 코드에 포함된 개행은 JSON 문자열로 이스케이프되므로 줄 단위 분리가 안전하다.

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; code: string }
  | { type: 'error'; error: string };

/**
 * NDJSON 버퍼에서 완결된 라인(마지막 개행 이전)을 이벤트로 파싱하고,
 * 마지막 개행 이후의 미완결 조각은 remainder로 돌려준다.
 * 빈 줄과 파싱 불가한 라인, type 없는 객체는 조용히 건너뛴다.
 */
export function parseNdjson(buffer: string): { events: StreamEvent[]; remainder: string } {
  const lastNewline = buffer.lastIndexOf('\n');
  if (lastNewline === -1) {
    return { events: [], remainder: buffer };
  }

  const complete = buffer.slice(0, lastNewline);
  const remainder = buffer.slice(lastNewline + 1);

  const events: StreamEvent[] = [];
  for (const line of complete.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as { type?: unknown };
      if (parsed && typeof parsed.type === 'string') {
        events.push(parsed as StreamEvent);
      }
    } catch {
      // 미완결/손상 라인은 무시한다.
    }
  }
  return { events, remainder };
}
