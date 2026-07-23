import type { GeneratedComponent, Provider } from '../types';

export const STORAGE_KEY = 'rcg:components';
export const PROVIDER_STORAGE_KEY = 'rcg:provider';
export const MAX_ITEMS = 20;
export const DEFAULT_PROVIDER: Provider = 'google';

// --- 순수 로직 (DOM 비의존, 단위 테스트 대상) ---

export function serializeComponents(components: GeneratedComponent[]): string {
  const bounded = components.slice(0, MAX_ITEMS).map((c) => ({
    id: c.id,
    prompt: c.prompt,
    code: c.code,
    createdAt: c.createdAt.toISOString(),
  }));
  return JSON.stringify(bounded);
}

export function parseStoredComponents(raw: string | null): GeneratedComponent[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const components: GeneratedComponent[] = [];
  for (const item of parsed) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      typeof item.prompt !== 'string' ||
      typeof item.code !== 'string'
    ) {
      continue;
    }
    const createdAt = new Date(item.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;

    components.push({ id: item.id, prompt: item.prompt, code: item.code, createdAt });
  }
  return components.slice(0, MAX_ITEMS);
}

export function parseStoredProvider(raw: string | null): Provider {
  return raw === 'anthropic' || raw === 'google' ? raw : DEFAULT_PROVIDER;
}

// --- localStorage 래퍼 (브라우저 경계, 수동 확인) ---

export function loadComponents(): GeneratedComponent[] {
  return parseStoredComponents(localStorage.getItem(STORAGE_KEY));
}

export function saveComponents(components: GeneratedComponent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeComponents(components));
  } catch {
    // 용량 초과 등 저장 실패는 조용히 무시 (히스토리는 부가 기능).
  }
}

export function loadProvider(): Provider {
  return parseStoredProvider(localStorage.getItem(PROVIDER_STORAGE_KEY));
}

export function saveProvider(provider: Provider): void {
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
  } catch {
    // 저장 실패는 조용히 무시.
  }
}
