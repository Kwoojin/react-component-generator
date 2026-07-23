import { describe, it, expect } from 'vitest';
import { parseNdjson } from './streamParser';

describe('parseNdjson', () => {
  it('완결된 NDJSON 라인들을 이벤트로 파싱하고 나머지를 remainder로 남긴다', () => {
    const buffer =
      '{"type":"delta","text":"const "}\n{"type":"delta","text":"A"}\n{"type":"done"';
    const { events, remainder } = parseNdjson(buffer);
    expect(events).toEqual([
      { type: 'delta', text: 'const ' },
      { type: 'delta', text: 'A' },
    ]);
    expect(remainder).toBe('{"type":"done"');
  });

  it('개행이 없으면 이벤트 없이 전체를 remainder로 남긴다', () => {
    const { events, remainder } = parseNdjson('{"type":"delta"');
    expect(events).toEqual([]);
    expect(remainder).toBe('{"type":"delta"');
  });

  it('done 이벤트의 code를 그대로 보존한다(개행 포함)', () => {
    const { events } = parseNdjson('{"type":"done","code":"const A = 1;\\nrender(<A/>);"}\n');
    expect(events).toEqual([{ type: 'done', code: 'const A = 1;\nrender(<A/>);' }]);
  });

  it('빈 줄과 잘못된 JSON 라인은 건너뛴다', () => {
    const buffer = '\n{bad json}\n{"type":"error","error":"boom"}\n';
    const { events, remainder } = parseNdjson(buffer);
    expect(events).toEqual([{ type: 'error', error: 'boom' }]);
    expect(remainder).toBe('');
  });

  it('type 필드가 없는 객체는 이벤트로 취급하지 않는다', () => {
    const { events } = parseNdjson('{"foo":"bar"}\n');
    expect(events).toEqual([]);
  });
});
