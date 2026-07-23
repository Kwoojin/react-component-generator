import { describe, it, expect } from 'vitest';
import { parseSSEBuffer, parseAnthropicEvent, parseGoogleEvent } from './stream';

describe('parseSSEBuffer', () => {
  it('완결된 data 라인들의 payload를 추출하고 나머지를 remainder로 남긴다', () => {
    const buffer = 'data: {"a":1}\ndata: {"b":2}\ndata: {"c"';
    const { payloads, remainder } = parseSSEBuffer(buffer);
    expect(payloads).toEqual(['{"a":1}', '{"b":2}']);
    expect(remainder).toBe('data: {"c"');
  });

  it('개행이 없으면 payload 없이 전체를 remainder로 남긴다', () => {
    const { payloads, remainder } = parseSSEBuffer('data: {"partial"');
    expect(payloads).toEqual([]);
    expect(remainder).toBe('data: {"partial"');
  });

  it('data 이외의 라인(event/빈 줄/주석)은 무시한다', () => {
    const buffer = 'event: message\ndata: {"x":1}\n\n: comment\n';
    const { payloads, remainder } = parseSSEBuffer(buffer);
    expect(payloads).toEqual(['{"x":1}']);
    expect(remainder).toBe('');
  });

  it('CRLF 개행에서도 data payload를 정리해 추출한다', () => {
    const { payloads } = parseSSEBuffer('data: {"x":1}\r\n\r\n');
    expect(payloads).toEqual(['{"x":1}']);
  });
});

describe('parseAnthropicEvent', () => {
  it('content_block_delta의 text_delta에서 텍스트를 추출한다', () => {
    const payload = JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'const ' },
    });
    expect(parseAnthropicEvent(payload)).toEqual({ text: 'const ', truncated: false, error: null });
  });

  it('message_delta의 stop_reason이 max_tokens면 truncated를 표시한다', () => {
    const payload = JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: 'max_tokens' },
    });
    expect(parseAnthropicEvent(payload)).toEqual({ text: '', truncated: true, error: null });
  });

  it('error 이벤트의 메시지를 error로 노출한다', () => {
    const payload = JSON.stringify({
      type: 'error',
      error: { type: 'overloaded_error', message: 'Overloaded' },
    });
    expect(parseAnthropicEvent(payload)).toEqual({ text: '', truncated: false, error: 'Overloaded' });
  });

  it('그 외 이벤트(ping/content_block_start 등)는 빈 결과를 반환한다', () => {
    expect(parseAnthropicEvent(JSON.stringify({ type: 'ping' }))).toEqual({
      text: '',
      truncated: false,
      error: null,
    });
  });

  it('잘못된 JSON은 빈 결과로 무시한다', () => {
    expect(parseAnthropicEvent('{not json')).toEqual({ text: '', truncated: false, error: null });
  });
});

describe('parseGoogleEvent', () => {
  it('candidates의 parts 텍스트를 이어붙여 추출한다', () => {
    const payload = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'const ' }, { text: 'A' }] } }],
    });
    expect(parseGoogleEvent(payload)).toEqual({ text: 'const A', truncated: false, error: null });
  });

  it('finishReason이 MAX_TOKENS면 truncated를 표시한다', () => {
    const payload = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'MAX_TOKENS' }],
    });
    expect(parseGoogleEvent(payload)).toEqual({ text: 'x', truncated: true, error: null });
  });

  it('error 필드가 있으면 메시지를 error로 노출한다', () => {
    const payload = JSON.stringify({ error: { code: 429, message: 'Too many requests' } });
    expect(parseGoogleEvent(payload)).toEqual({ text: '', truncated: false, error: 'Too many requests' });
  });

  it('candidates가 없으면 빈 결과를 반환한다', () => {
    expect(parseGoogleEvent(JSON.stringify({}))).toEqual({ text: '', truncated: false, error: null });
  });

  it('잘못된 JSON은 빈 결과로 무시한다', () => {
    expect(parseGoogleEvent('nope')).toEqual({ text: '', truncated: false, error: null });
  });
});
