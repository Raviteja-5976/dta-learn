import { z } from "zod";
import { getViewer, type Viewer } from "@/lib/auth";
import { loadItemForViewer, type LoadedItem } from "@/lib/access";
import { buildTutorContext, clientContextSchema } from "@/lib/ai/context";
import { openGrokStream, type ChatMessage } from "@/lib/ai/grok";
import { GLITCH_SYSTEM_PROMPT } from "@/lib/ai/persona";
import { serverEnv } from "@/lib/env";
import { logEvent } from "@/lib/events";
import { HttpError, assertSameOrigin, handle, readJson } from "@/lib/http";
import { getAiTutorSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/server";
import type { AiMessage } from "@/lib/types";

/**
 * Glitch, the AI tutor. One conversation per learner per item.
 *   GET    ?itemId=  → history + remaining questions today
 *   POST   { itemId, message, context } → streamed plain-text answer
 *   DELETE ?itemId=  → start a new chat (archives; still counts toward the cap)
 */

const HISTORY_TURNS = 12;
const PER_MINUTE = 6;
const DAY_MS = 86_400_000;

interface Quota {
  limit: number | null; // null = unlimited (staff)
  remaining: number | null;
}

async function tutorGate(request: Request, itemId: string | null): Promise<{ viewer: Viewer; loaded: LoadedItem }> {
  const viewer = await getViewer();
  if (!viewer) throw new HttpError(401, "Sign in required");
  if (!itemId || !z.uuid().safeParse(itemId).success) throw new HttpError(400, "itemId is required");
  const loaded = await loadItemForViewer(viewer, itemId);
  if (!loaded || !loaded.canView) throw new HttpError(404, "Lesson not found");
  if (loaded.item.kind === "quiz") throw new HttpError(403, "Glitch sits out quizzes. That one's all you.");
  if (loaded.item.kind === "lab" && !loaded.access.enrolled && !loaded.access.isStaff) throw new HttpError(403, "Enroll in the course to use the tutor in labs.");
  return { viewer, loaded };
}

async function quotaFor(viewer: Viewer, dailyLimit: number): Promise<Quota> {
  if (viewer.profile.role !== "student") return { limit: null, remaining: null };
  const { count } = await createAdminClient()
    .from("ai_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", viewer.user.id)
    .eq("role", "user")
    .gte("created_at", new Date(Date.now() - DAY_MS).toISOString());
  return { limit: dailyLimit, remaining: Math.max(0, dailyLimit - (count ?? 0)) };
}

export async function GET(request: Request) {
  return handle(async () => {
    const itemId = new URL(request.url).searchParams.get("itemId");
    const { viewer, loaded } = await tutorGate(request, itemId);
    const settings = await getAiTutorSettings();
    const { data } = await createAdminClient()
      .from("ai_messages")
      .select("id, role, content, created_at")
      .eq("user_id", viewer.user.id)
      .eq("item_id", loaded.item.id)
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(40);
    const quota = await quotaFor(viewer, settings.dailyLimit);
    return Response.json({
      available: serverEnv.xaiConfigured() && (settings.enabled || viewer.profile.role !== "student"),
      messages: ((data ?? []) as AiMessage[]).reverse(),
      ...quota,
    });
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const itemId = new URL(request.url).searchParams.get("itemId");
    const { viewer, loaded } = await tutorGate(request, itemId);
    await createAdminClient().from("ai_messages").update({ archived: true }).eq("user_id", viewer.user.id).eq("item_id", loaded.item.id).eq("archived", false);
    return Response.json({ ok: true });
  });
}

const postSchema = z.object({
  itemId: z.uuid(),
  message: z.string().trim().min(1, "Ask something first").max(2_000, "Keep questions under 2,000 characters"),
  context: clientContextSchema,
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readJson(request, postSchema);
    const { viewer, loaded } = await tutorGate(request, body.itemId);
    const { item, course } = loaded;

    const settings = await getAiTutorSettings();
    const isStaff = viewer.profile.role !== "student";
    if (!serverEnv.xaiConfigured() || (!settings.enabled && !isStaff)) throw new HttpError(503, "Glitch is switched off right now.");

    const admin = createAdminClient();
    const quota = await quotaFor(viewer, settings.dailyLimit);
    if (quota.remaining !== null && quota.remaining <= 0) {
      throw new HttpError(429, `You've used today's ${settings.dailyLimit} questions. Glitch is thrilled and has gone to sleep. Try again tomorrow.`, { remaining: 0 });
    }
    if (!isStaff) {
      const { count } = await admin
        .from("ai_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", viewer.user.id)
        .eq("role", "user")
        .gte("created_at", new Date(Date.now() - 60_000).toISOString());
      if ((count ?? 0) >= PER_MINUTE) throw new HttpError(429, "Slow down! Even a lazy robot needs a minute between that many questions.");
    }

    const [context, { data: historyRows }] = await Promise.all([
      buildTutorContext(item, course, viewer.user.id, body.context),
      admin
        .from("ai_messages")
        .select("role, content")
        .eq("user_id", viewer.user.id)
        .eq("item_id", item.id)
        .eq("archived", false)
        .order("created_at", { ascending: false })
        .limit(HISTORY_TURNS),
    ]);
    const history = ((historyRows ?? []) as Pick<AiMessage, "role" | "content">[]).reverse().map((m): ChatMessage => ({ role: m.role, content: m.content.slice(0, 4_000) }));
    const learnerName = viewer.profile.full_name?.split(" ")[0];
    const messages: ChatMessage[] = [
      { role: "system", content: GLITCH_SYSTEM_PROMPT },
      { role: "system", content: `${context}${learnerName ? `\n\nThe learner's first name: ${learnerName}` : ""}` },
      ...history,
      { role: "user", content: body.message },
    ];

    // Abort the upstream call if the learner closes the panel or leaves the page.
    const upstreamAbort = new AbortController();
    request.signal.addEventListener("abort", () => upstreamAbort.abort(), { once: true });
    const { model, chunks } = await openGrokStream(messages, { signal: upstreamAbort.signal });

    // Count the question only once Grok has accepted it.
    await admin.from("ai_messages").insert({ user_id: viewer.user.id, item_id: item.id, course_id: course.id, role: "user", content: body.message });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let answer = "";
        let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
        try {
          for await (const chunk of chunks) {
            if (chunk.usage) usage = chunk.usage;
            if (chunk.text) {
              answer += chunk.text;
              controller.enqueue(encoder.encode(chunk.text));
            }
          }
        } catch (e) {
          if ((e as Error).name !== "AbortError") {
            console.error("tutor stream failed", e);
            const note = "\n\n_(Glitch's connection dropped mid-sentence. Typical. Ask again.)_";
            answer += note;
            try {
              controller.enqueue(encoder.encode(note));
            } catch {
              /* client already gone */
            }
          }
        } finally {
          if (answer.trim()) {
            await admin.from("ai_messages").insert({
              user_id: viewer.user.id,
              item_id: item.id,
              course_id: course.id,
              role: "assistant",
              content: answer,
              model,
              tokens_in: usage?.prompt_tokens ?? null,
              tokens_out: usage?.completion_tokens ?? null,
            });
          }
          await logEvent({ actorId: viewer.user.id, verb: "asked", objectType: item.kind, objectId: item.id, context: { tutor: "glitch", tokensOut: usage?.completion_tokens ?? null } });
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      },
      cancel() {
        upstreamAbort.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
        "X-Tutor-Remaining": quota.remaining === null ? "unlimited" : String(quota.remaining - 1),
      },
    });
  });
}
