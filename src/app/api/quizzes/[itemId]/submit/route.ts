import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { loadItemForViewer } from "@/lib/access";
import { HttpError, assertSameOrigin, handle, readJson } from "@/lib/http";
import { completeItem, recordAttemptScore } from "@/lib/progress";
import { logEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/server";
import type { Question, QuestionKey, Quiz } from "@/lib/types";

const bodySchema = z.object({
  answers: z.record(z.string(), z.array(z.string().max(2000)).max(50)),
});

function normalizeText(s: string, caseSensitive: boolean): string {
  const t = s.trim().replace(/\s+/g, " ");
  return caseSensitive ? t : t.toLowerCase();
}

/** Grade a quiz on the server. Answer keys never leave the server until graded. */
export async function POST(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  return handle(async () => {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Sign in required");
    const { itemId } = await params;
    const loaded = await loadItemForViewer(viewer, itemId);
    if (!loaded || !loaded.canView || loaded.item.kind !== "quiz") throw new HttpError(404, "Quiz not found");
    if (!loaded.access.enrolled) throw new HttpError(403, "Enroll in the course to submit quizzes");
    const { answers } = await readJson(request, bodySchema);

    const admin = createAdminClient();
    const [{ data: quiz }, { data: questions }, { count: used }] = await Promise.all([
      admin.from("quizzes").select("*").eq("item_id", itemId).single<Quiz>(),
      admin.from("questions").select("*").eq("item_id", itemId).order("position").returns<Question[]>(),
      admin.from("quiz_attempts").select("id", { count: "exact", head: true }).eq("user_id", viewer.user.id).eq("item_id", itemId),
    ]);
    if (!quiz || !questions?.length) throw new HttpError(404, "Quiz has no questions");
    if (quiz.max_attempts && (used ?? 0) >= quiz.max_attempts) throw new HttpError(403, "No attempts left for this quiz");

    const { data: keys } = await admin.from("question_keys").select("*").in("question_id", questions.map((q) => q.id)).returns<QuestionKey[]>();
    const keyById = new Map((keys ?? []).map((k) => [k.question_id, k]));

    let earned = 0;
    let total = 0;
    const results: Record<string, { correct: boolean; correctOptionIds?: string[]; accepted?: string[]; explanation?: string | null }> = {};
    const cleanAnswers: Record<string, string[]> = {};

    for (const q of questions) {
      total += q.points;
      const key = keyById.get(q.id);
      const given = (answers[q.id] ?? []).filter((a) => a !== "");
      cleanAnswers[q.id] = given;
      let correct = false;
      if (key) {
        if (q.type === "single" || q.type === "multiple") {
          const want = new Set(key.answer.correct ?? []);
          const got = new Set(given);
          correct = want.size > 0 && want.size === got.size && [...want].every((x) => got.has(x));
        } else {
          const cs = Boolean(key.answer.caseSensitive);
          const accepted = (key.answer.accepted ?? []).map((a) => normalizeText(a, cs));
          correct = given.length > 0 && accepted.includes(normalizeText(given[0], cs));
        }
      }
      if (correct) earned += q.points;
      results[q.id] = quiz.show_answers
        ? {
            correct,
            correctOptionIds: q.type === "single" || q.type === "multiple" ? key?.answer.correct : undefined,
            accepted: q.type === "text" || q.type === "code_output" ? key?.answer.accepted : undefined,
            explanation: key?.explanation ?? null,
          }
        : { correct };
    }

    const score = total ? Math.round((earned / total) * 10000) / 100 : 0;
    const passed = score >= quiz.pass_score;

    await admin.from("quiz_attempts").insert({
      user_id: viewer.user.id,
      item_id: itemId,
      course_id: loaded.item.course_id,
      answers: cleanAnswers,
      results,
      score,
      passed,
    });
    await logEvent({ actorId: viewer.user.id, verb: "attempted", objectType: "quiz", objectId: itemId, result: { score, passed } });

    let outcome = { courseCompleted: false, certificateCode: null as string | null };
    if (passed) outcome = await completeItem(viewer.user.id, loaded.item, { score, evidence: "server" });
    else await recordAttemptScore(viewer.user.id, loaded.item, score);

    return Response.json({
      score,
      passed,
      passScore: quiz.pass_score,
      results,
      answers: cleanAnswers,
      attemptsLeft: quiz.max_attempts ? Math.max(0, quiz.max_attempts - (used ?? 0) - 1) : null,
      courseCompleted: outcome.courseCompleted,
      certificateCode: outcome.certificateCode,
    });
  });
}
