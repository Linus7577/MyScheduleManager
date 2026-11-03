import { MAX_REPLY_TOKENS, RATE_LIMIT_RETRIES, RETRY_BASE_MS, RETRY_MAX_WAIT_MS } from "@/config/oracle.config";

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type CompletionRequest = {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  onText?: (text: string) => void;
};

export type CompletionResult = { text: string; toolCalls: ToolCall[] };

/** Anything that can answer. Changing AI provider means changing settings, not this interface or its callers. */
export interface AiProvider {
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

export class ProviderError extends Error {
  constructor(readonly code: "oracleBusy" | "oracleUnavailable") {
    super(code);
  }
}

type StreamChunk = {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
};

/** Reads the provider's event stream, joining the pieces of text and tool calls as they arrive. */
export async function readCompletionStream(
  body: ReadableStream<Uint8Array>,
  onText?: (text: string) => void
): Promise<CompletionResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const calls: ToolCall[] = [];
  let text = "";
  let buffer = "";

  function handle(line: string) {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;

    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(data) as StreamChunk;
    } catch {
      return;
    }

    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) {
      text += delta.content;
      onText?.(delta.content);
    }
    for (const part of delta?.tool_calls ?? []) {
      // Providers send a call in pieces. A new id or index starts a call, and later pieces extend it.
      const index = part.index ?? (part.id ? calls.length : calls.length - 1);
      calls[index] ??= { id: part.id ?? `call_${index}`, type: "function", function: { name: "", arguments: "" } };
      if (part.id) calls[index].id = part.id;
      if (part.function?.name) calls[index].function.name += part.function.name;
      if (part.function?.arguments) calls[index].function.arguments += part.function.arguments;
    }
  }

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handle);
  }
  handle(buffer);

  return { text, toolCalls: calls.filter(Boolean) };
}

type ProviderOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Works with any service that speaks the OpenAI chat format, which is what makes switching a settings change. */
export function createOpenAiCompatibleProvider(options: ProviderOptions): AiProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  return {
    async complete({ messages, tools, onText }) {
      for (let attempt = 0; ; attempt++) {
        let response: Response;
        try {
          response = await fetchImpl(`${options.baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
            body: JSON.stringify({
              model: options.model,
              messages,
              ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
              stream: true,
              temperature: 0.4,
              max_tokens: MAX_REPLY_TOKENS,
            }),
          });
        } catch {
          throw new ProviderError("oracleUnavailable");
        }

        if (response.status === 429) {
          if (attempt >= RATE_LIMIT_RETRIES) throw new ProviderError("oracleBusy");
          const retryAfter = Number(response.headers.get("retry-after"));
          const wait = retryAfter > 0 ? retryAfter * 1000 : RETRY_BASE_MS * 2 ** attempt;
          // Waiting longer than this would feel broken, so tell the owner instead.
          if (wait > RETRY_MAX_WAIT_MS) throw new ProviderError("oracleBusy");
          await sleep(wait);
          continue;
        }

        if (!response.ok || !response.body) throw new ProviderError("oracleUnavailable");
        return readCompletionStream(response.body, onText);
      }
    },
  };
}
