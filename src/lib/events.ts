import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/** xAPI-like learning event: actor · verb · object · result (design §20). */
export async function logEvent(e: {
  actorId: string | null;
  verb: string;
  objectType: string;
  objectId?: string | null;
  result?: Record<string, unknown>;
  context?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await createAdminClient().from("learning_events").insert({
    actor_id: e.actorId,
    verb: e.verb,
    object_type: e.objectType,
    object_id: e.objectId ?? null,
    result: e.result ?? null,
    context: e.context ?? null,
  });
  if (error) console.error("learning_events insert failed", error.message);
}

/** Every privileged write is audited (design §11). */
export async function audit(e: {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  const { error } = await createAdminClient().from("audit_logs").insert({
    actor_id: e.actorId,
    action: e.action,
    resource_type: e.resourceType,
    resource_id: e.resourceId ?? null,
    before: e.before ?? null,
    after: e.after ?? null,
  });
  if (error) console.error("audit_logs insert failed", error.message);
}
