import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { logEvent } from "@/lib/events";

const beaconSchema = z.object({
  event: z.enum(["sandbox_launch", "sandbox_ready", "sandbox_stop", "sandbox_error"]),
  attemptId: z.string().uuid().optional(),
  labId: z.string().uuid().optional(),
  image: z.string().max(200).optional(),
  engine: z.string().max(60).optional(),
  bootMs: z.number().nonnegative().optional(),
  uptimeMs: z.number().nonnegative().optional(),
  reason: z.string().max(40).optional(),
  error: z.string().max(500).optional(),
  warm: z.boolean().optional(),
});

/**
 * First-party analytics beacons from the isolated terminal route (design §4.8,
 * §24). Third-party analytics scripts are blocked by COEP there, so the lab
 * page reports boot times and stops here. sendBeacon posts text/plain.
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = JSON.parse(await request.text());
  } catch {
    return new Response(null, { status: 204 });
  }
  const parsed = beaconSchema.safeParse(raw);
  if (!parsed.success) return new Response(null, { status: 204 });
  const viewer = await getViewer();
  const { event, attemptId, labId, ...rest } = parsed.data;
  await logEvent({
    actorId: viewer?.user.id ?? null,
    verb: event,
    objectType: "sandbox",
    objectId: labId ?? null,
    result: rest,
    context: { attemptId, userAgent: request.headers.get("user-agent")?.slice(0, 200) },
  });
  return new Response(null, { status: 204 });
}
