// @vitest-environment node
// 순수 함수만 검증하므로 DOM이 필요 없다. 프로젝트 전역 jsdom 환경을 이 파일에서만 node로 덮어쓴다.
import { describe, it, expect } from 'vitest';
import {
  serializeComponents,
  parseStoredComponents,
  parseStoredProvider,
  DEFAULT_PROVIDER,
  MAX_ITEMS,
} from './componentStorage';
import type { GeneratedComponent } from '../types';

function makeComponent(overrides: Partial<GeneratedComponent> = {}): GeneratedComponent {
  return {
    id: 'id-1',
    prompt: '버튼 만들어줘',
    code: 'const A = () => null;\nrender(<A />);',
    createdAt: new Date('2026-07-23T01:00:00.000Z'),
    ...overrides,
  };
}

describe('serialize → parse 왕복', () => {
  it('저장한 컴포넌트를 그대로 복원한다', () => {
    const components = [makeComponent()];
    const restored = parseStoredComponents(serializeComponents(components));

    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe('id-1');
    expect(restored[0].prompt).toBe('버튼 만들어줘');
    expect(restored[0].code).toBe('const A = () => null;\nrender(<A />);');
  });

  it('createdAt을 Date 객체로 복원한다', () => {
    const restored = parseStoredComponents(serializeComponents([makeComponent()]));

    expect(restored[0].createdAt).toBeInstanceOf(Date);
    expect(restored[0].createdAt.toISOString()).toBe('2026-07-23T01:00:00.000Z');
  });
});

describe('parseStoredComponents 빈/손상 데이터', () => {
  it('null이면 빈 배열을 반환한다', () => {
    expect(parseStoredComponents(null)).toEqual([]);
  });

  it('JSON이 아니면 빈 배열을 반환한다', () => {
    expect(parseStoredComponents('{잘못된 json')).toEqual([]);
  });

  it('배열이 아니면 빈 배열을 반환한다', () => {
    expect(parseStoredComponents(JSON.stringify({ nope: true }))).toEqual([]);
  });

  it('필수 필드가 없는 항목은 제외한다', () => {
    const valid = { id: 'ok', prompt: 'p', code: 'c', createdAt: '2026-07-23T01:00:00.000Z' };
    const invalid = { id: 'bad', prompt: 'p' }; // code, createdAt 누락
    const restored = parseStoredComponents(JSON.stringify([valid, invalid]));

    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe('ok');
  });

  it('createdAt이 유효하지 않은 항목은 제외한다', () => {
    const bad = { id: 'x', prompt: 'p', code: 'c', createdAt: 'not-a-date' };
    expect(parseStoredComponents(JSON.stringify([bad]))).toEqual([]);
  });
});

describe('parseStoredProvider', () => {
  it('유효한 provider 값을 그대로 반환한다', () => {
    expect(parseStoredProvider('anthropic')).toBe('anthropic');
    expect(parseStoredProvider('google')).toBe('google');
  });

  it('null이면 기본 provider를 반환한다', () => {
    expect(parseStoredProvider(null)).toBe(DEFAULT_PROVIDER);
  });

  it('알 수 없는 값이면 기본 provider를 반환한다', () => {
    expect(parseStoredProvider('openai')).toBe(DEFAULT_PROVIDER);
    expect(parseStoredProvider('')).toBe(DEFAULT_PROVIDER);
  });
});

describe(`개수 상한 (${MAX_ITEMS})`, () => {
  it('serialize 시 최근 항목만 남기고 오래된 것은 버린다 (배열 앞이 최신)', () => {
    const many = Array.from({ length: MAX_ITEMS + 5 }, (_, i) =>
      makeComponent({ id: `id-${i}` }),
    );
    const restored = parseStoredComponents(serializeComponents(many));

    expect(restored).toHaveLength(MAX_ITEMS);
    expect(restored[0].id).toBe('id-0');
    expect(restored[MAX_ITEMS - 1].id).toBe(`id-${MAX_ITEMS - 1}`);
  });
});
