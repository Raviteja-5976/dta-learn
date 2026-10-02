import "server-only";
import { serverEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";

/**
 * Grok (xAI) chat completions with streaming. The API is OpenAI-compatible:
 * POST {base}/chat/completions with stream: true returns SSE "data:" lines
 * carrying choices[0].delta.content, then "data: [DONE]".
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamChunk {
  text?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export async function openGrokStream(messages: ChatMessage[], opts: { signal?: AbortSignal; maxTokens?: number; temperature?: number } = {}): Promise<{ model: string; chunks: AsyncGenerator<StreamChunk> }> {
  const { apiKey, baseUrl, model } = serverEnv.xai();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: opts.maxTokens ?? 1200,
        temperature: opts.temperature ?? 0.7,
      }),
      signal: opts.signal,
      cache: "no-store",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    console.error("xAI request failed", e);
    throw new HttpError(502, "Glitch couldn't reach its brain (the AI service). Try again in a moment.");
  }
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    console.error("xAI error", res.status, detail.slice(0, 500));
    if (res.status === 429) throw new HttpError(429, "Glitch is swamped right now. Give it a minute and try again.");
    throw new HttpError(502, "Glitch is offline for a moment (the AI service returned an error). Try again shortly.");
  }
  return { model, chunks: parseSse(res.body) };
}

async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data) as { choices?: { delta?: { content?: string | null } }[]; usage?: StreamChunk["usage"] };
          const text = json.choices?.[0]?.delta?.content ?? undefined;
          if (text || json.usage) yield { text: text || undefined, usage: json.usage };
        } catch {
          /* keep-alive or partial line: ignore */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
