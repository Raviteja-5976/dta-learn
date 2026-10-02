import "server-only";
import { z } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export function jsonError(status: number, message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error: message, ...extra }, { status });
}

/** Parse and validate a JSON request body with a Zod schema. */
export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  }
  return parsed.data;
}

/**
 * State-changing requests must come from our own origin (design §12).
 * Browsers always send Origin on POST/PUT/DELETE fetches.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "Cross-origin request rejected");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "Invalid Origin header");
  }
}

/** Wrap a route handler body: converts HttpError and unknown errors to JSON. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return jsonError(e.status, e.message, e.extra);
    console.error(e);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}
