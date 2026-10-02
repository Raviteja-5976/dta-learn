import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { loadItemForViewer } from "@/lib/access";
import { parseBlocks } from "@/lib/blocks/schema";
import { presignDownload } from "@/lib/s3";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Private downloads (design §18): entitlement is checked first, the key must
 * be referenced by the item's own article, then we redirect to a 10-minute
 * signed S3 URL.
 */
export async function GET(request: NextRequest) {
  const itemId = request.nextUrl.searchParams.get("item") ?? "";
  const key = request.nextUrl.searchParams.get("key") ?? "";
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL(`/login`, request.nextUrl.origin));

  const loaded = itemId ? await loadItemForViewer(viewer, itemId) : null;
  if (!loaded?.canView) return new Response("Not found", { status: 404 });

  const { data: article } = await createAdminClient().from("articles").select("blocks").eq("item_id", itemId).maybeSingle<{ blocks: unknown }>();
  const block = parseBlocks(article?.blocks ?? []).blocks.find((b) => b.type === "file" && b.data.key === key);
  if (!block || block.type !== "file") return new Response("Not found", { status: 404 });

  const url = await presignDownload(key, block.data.name);
  return NextResponse.redirect(url, { status: 302 });
}
