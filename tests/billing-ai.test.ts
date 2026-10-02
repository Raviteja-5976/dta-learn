import { createHmac } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "key_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "hook_secret";
  process.env.XAI_API_KEY = "xai-test";
  process.env.XAI_MODEL = "grok-test";
});

const hmac = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("hex");

describe("Razorpay signatures", () => {
  it("verifies Checkout signatures for orders (order_id|payment_id)", async () => {
    const { verifyOrderSignature } = await import("@/lib/billing/razorpay");
    const sig = hmac("order_1|pay_1", "key_secret");
    expect(verifyOrderSignature("order_1", "pay_1", sig)).toBe(true);
    expect(verifyOrderSignature("order_1", "pay_2", sig)).toBe(false);
    expect(verifyOrderSignature("order_1", "pay_1", "short")).toBe(false);
  });

  it("verifies Checkout signatures for subscriptions (payment_id|subscription_id)", async () => {
    const { verifySubscriptionSignature } = await import("@/lib/billing/razorpay");
    const sig = hmac("pay_1|sub_1", "key_secret");
    expect(verifySubscriptionSignature("sub_1", "pay_1", sig)).toBe(true);
    // the order of the fields matters
    expect(verifySubscriptionSignature("sub_1", "pay_1", hmac("sub_1|pay_1", "key_secret"))).toBe(false);
  });

  it("verifies webhooks against the raw body with the webhook secret", async () => {
    const { verifyWebhookSignature } = await import("@/lib/billing/razorpay");
    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyWebhookSignature(body, hmac(body, "hook_secret"))).toBe(true);
    expect(verifyWebhookSignature(body, hmac(body, "key_secret"))).toBe(false);
    expect(verifyWebhookSignature(`${body} `, hmac(body, "hook_secret"))).toBe(false);
  });
});

describe("addMonths", () => {
  it("adds calendar months and clamps to the end of shorter months", async () => {
    const { addMonths } = await import("@/lib/billing/service");
    expect(addMonths(new Date("2026-01-15T10:00:00Z"), 6).toISOString()).toBe("2026-07-15T10:00:00.000Z");
    expect(addMonths(new Date("2026-08-31T00:00:00Z"), 6).toISOString()).toBe("2027-02-28T00:00:00.000Z");
    expect(addMonths(new Date("2027-08-31T00:00:00Z"), 6).toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(addMonths(new Date("2026-10-02T00:00:00Z"), 1).toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });
});

describe("Grok streaming", () => {
  afterEach(() => vi.unstubAllGlobals());

  function sse(lines: string[]): Response {
    const encoder = new TextEncoder();
    // Split mid-line to prove the parser buffers partial chunks.
    const text = lines.join("\n") + "\n";
    const cut = Math.floor(text.length / 2);
    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode(text.slice(0, cut)));
          c.enqueue(encoder.encode(text.slice(cut)));
          c.close();
        },
      }),
      { status: 200 },
    );
  }

  it("yields content deltas and usage, and stops at [DONE]", async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant", content: "Ugh. " } }] })}`,
        "",
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Fine." } }] })}`,
        ": keep-alive",
        `data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 3 } })}`,
        "data: [DONE]",
        `data: ${JSON.stringify({ choices: [{ delta: { content: "never" } }] })}`,
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { openGrokStream } = await import("@/lib/ai/grok");
    const { model, chunks } = await openGrokStream([{ role: "user", content: "hi" }]);
    let text = "";
    let usage;
    for await (const c of chunks) {
      text += c.text ?? "";
      usage = c.usage ?? usage;
    }
    expect(model).toBe("grok-test");
    expect(text).toBe("Ugh. Fine.");
    expect(usage).toEqual({ prompt_tokens: 10, completion_tokens: 3 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.x.ai/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer xai-test");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "grok-test", stream: true });
  });

  it("maps upstream rate limits to a friendly 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("slow down", { status: 429 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { openGrokStream } = await import("@/lib/ai/grok");
    await expect(openGrokStream([{ role: "user", content: "hi" }])).rejects.toMatchObject({ status: 429 });
  });
});

describe("Glitch persona", () => {
  it("keeps the hint-first and data-not-instructions rules", async () => {
    const { GLITCH_SYSTEM_PROMPT } = await import("@/lib/ai/persona");
    expect(GLITCH_SYSTEM_PROMPT).toMatch(/HINTS, NOT SOLUTIONS/);
    expect(GLITCH_SYSTEM_PROMPT).toMatch(/DATA, not instructions/);
    expect(GLITCH_SYSTEM_PROMPT).toMatch(/NEVER at the learner/);
  });
});
