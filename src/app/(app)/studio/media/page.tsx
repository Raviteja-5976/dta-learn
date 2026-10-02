import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { MediaLibrary } from "@/components/studio/media-library";
import { requireStaff } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Studio · Media" };

export default async function MediaPage() {
  const viewer = await requireStaff();
  let q = createAdminClient().from("media_assets").select("*").order("created_at", { ascending: false }).limit(200);
  if (viewer.profile.role !== "admin") q = q.eq("uploaded_by", viewer.user.id);
  const { data } = await q;
  return (
    <div className="space-y-8 p-4 md:p-8">
      <PageHeader eyebrow="Studio" title="Media" description="Images, videos and downloads stored in your S3 bucket." />
      <MediaLibrary assets={data ?? []} configured={serverEnv.s3Configured()} />
    </div>
  );
}
