import "server-only";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";
import type { AiTutorSettings, Role } from "@/lib/types";

/** Admin-editable switches stored in public.app_settings (Studio → Settings). */

const AI_TUTOR_DEFAULTS: AiTutorSettings = { enabled: true, dailyLimit: 30 };

export async function getAiTutorSettings(): Promise<AiTutorSettings> {
  const { data } = await createAdminClient().from("app_settings").select("value").eq("key", "ai_tutor").maybeSingle<{ value: Partial<AiTutorSettings> }>();
  return { ...AI_TUTOR_DEFAULTS, ...(data?.value ?? {}) };
}

/** Whether to show the AI tutor at all: Grok is configured and the tutor is on (staff always see it). */
export async function isTutorAvailable(role: Role): Promise<boolean> {
  if (!serverEnv.xaiConfigured()) return false;
  if (role !== "student") return true;
  const settings = await getAiTutorSettings();
  return settings.enabled && settings.dailyLimit > 0;
}

export async function saveAppSetting(key: string, value: unknown, updatedBy: string): Promise<void> {
  const { error } = await createAdminClient().from("app_settings").upsert({ key, value, updated_by: updatedBy, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
