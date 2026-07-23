import { stripCodeFences, ensureRenderCall } from './generator';
import { withModelFallback } from './fallback';
import { parseSSEBuffer, parseAnthropicEvent, parseGoogleEvent, type SSEParseResult } from './stream';

// 우선순위 순서. 앞 모델이 실패하면 다음 모델로 폴백한다.
const GOOGLE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

const SYSTEM_PROMPT = `You are a React component generator. Generate a single React component based on the user's description.

Rules:
- Use inline styles only (no CSS imports, no CSS modules)
- Do NOT use import statements — React is already available in scope as a global
- Define the component as a function, then call render(<ComponentName />) at the end
- Make the component visually appealing with proper styling
- Use React hooks if needed (e.g., React.useState, React.useEffect)
- The component must be completely self-contained
- Respond with ONLY the code block — no explanations, no markdown fences
- Use descriptive variable names and clean formatting
- For colors, prefer modern palettes (gradients, shadows, etc.)
- Ensure the component is interactive where appropriate (hover states, click handlers, etc.)
- Do NOT use TypeScript syntax — no type annotations, no interfaces, no generics, no "as" casts. Write plain JavaScript only.

Example output format:
const GradientButton = () => {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      style={{
        background: hovered
          ? 'linear-gradient(135deg, #667eea, #764ba2)'
          : 'linear-gradient(135deg, #764ba2, #667eea)',
        color: 'white',
        border: 'none',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '16px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      Click me
    </button>
  );
};

render(<GradientButton />);`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type Provider = 'anthropic' | 'google';

const ENV_KEYS: Record<Provider, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
};

function resolveApiKey(provider: Provider, clientKey?: string): string | null {
  return clientKey || ENV_KEYS[provider] || null;
}

const CODE_TOO_LONG_ERROR = '생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.';
const STREAM_ERROR = 'AI 응답 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

// SSE 스트림 응답을 연다. !ok면 throw해 withModelFallback이 다음 모델로 넘어가게 한다.
async function streamAnthropic(prompt: string, apiKey: string): Promise<Response> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }
  return response;
}

async function streamGoogleModel(prompt: string, apiKey: string, model: string): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }
  return response;
}

async function streamGoogle(prompt: string, apiKey: string): Promise<Response> {
  return withModelFallback(GOOGLE_MODELS, (model) => streamGoogleModel(prompt, apiKey, model));
}

// AI provider의 SSE 응답을 읽어 클라이언트용 NDJSON 스트림으로 릴레이한다.
//   - delta: 실시간 표시용 원본 텍스트 조각(정규화 전)
//   - done : stripCodeFences → ensureRenderCall로 정규화한 실행 가능 코드(딱 한 번)
//   - error: 사용자용 한국어 오류 메시지
// 골든룰: 실제 실행되는 코드(done.code)는 반드시 서버 정규화를 거친다. delta는 표시 전용이다.
function relayStream(
  aiResponse: Response,
  parseEvent: (payload: string) => SSEParseResult,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // 클라이언트가 이미 끊겼으면 enqueue가 throw하므로 조용히 무시한다.
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        } catch {
          /* controller closed (client disconnected) */
        }
      };

      const body = aiResponse.body;
      if (!body) {
        send({ type: 'error', error: STREAM_ERROR });
        controller.close();
        return;
      }

      reader = body.getReader();
      let buffer = '';
      let full = '';
      let truncated = false;
      let providerError: string | null = null;

      const consume = (payloads: string[]) => {
        for (const payload of payloads) {
          const { text, truncated: isTruncated, error } = parseEvent(payload);
          if (error) providerError = error;
          if (isTruncated) truncated = true;
          if (text) {
            full += text;
            send({ type: 'delta', text });
          }
        }
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { payloads, remainder } = parseSSEBuffer(buffer);
          buffer = remainder;
          consume(payloads);
        }
        // 스트림 종료 후 남은 미완결 조각을 flush한다.
        const tail = buffer + decoder.decode();
        if (tail.trim()) {
          consume(parseSSEBuffer(tail.endsWith('\n') ? tail : `${tail}\n`).payloads);
        }

        if (providerError) {
          send({ type: 'error', error: STREAM_ERROR });
        } else if (truncated) {
          send({ type: 'error', error: CODE_TOO_LONG_ERROR });
        } else {
          send({ type: 'done', code: ensureRenderCall(stripCodeFences(full)) });
        }
      } catch {
        send({ type: 'error', error: STREAM_ERROR });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    // 소비자(브라우저)가 스트림을 취소하면 상류 provider 연결도 해제한다.
    async cancel() {
      try {
        await reader?.cancel();
      } catch {
        /* noop */
      }
    },
  });
}

const server = Bun.serve({
  port: 3002,
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return Response.json(
        {
          envKeys: {
            anthropic: !!ENV_KEYS.anthropic,
            google: !!ENV_KEYS.google,
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      try {
        const { prompt, apiKey, provider = 'anthropic' } = (await req.json()) as {
          prompt: string;
          apiKey?: string;
          provider?: Provider;
        };

        const resolvedKey = resolveApiKey(provider, apiKey);

        if (!resolvedKey) {
          return Response.json(
            { error: `API key is required. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY'} in .env or enter it manually.` },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        if (!prompt) {
          return Response.json(
            { error: 'Prompt is required' },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        // AI provider의 SSE 스트림을 연다. 여기서 나는 오류(!ok)는 아래 catch에서
        // 상태코드→한국어 메시지로 변환한다(스트림 본문이 시작되기 전이므로 JSON 응답 가능).
        const aiResponse =
          provider === 'google'
            ? await streamGoogle(prompt, resolvedKey)
            : await streamAnthropic(prompt, resolvedKey);
        const parseEvent = provider === 'google' ? parseGoogleEvent : parseAnthropicEvent;

        return new Response(relayStream(aiResponse, parseEvent), {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-cache',
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';

        if (message.includes('503')) {
          return Response.json(
            { error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.' },
            { status: 503, headers: CORS_HEADERS }
          );
        }

        if (message.includes('429')) {
          return Response.json(
            { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
            { status: 429, headers: CORS_HEADERS }
          );
        }

        return Response.json(
          { error: message },
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }

    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: CORS_HEADERS }
    );
  },
});

console.log(`API server running at http://localhost:${server.port}`);
