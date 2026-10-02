import { z } from "zod";
import { getViewer, isStaffRole } from "@/lib/auth";
import { HttpError, assertSameOrigin, handle, readJson } from "@/lib/http";
import { serverEnv } from "@/lib/env";
import { MAX_UPLOAD_BYTES, buildKey, isAllowedContentType, presignUpload, publicUrl } from "@/lib/s3";
import { createAdminClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  size: z.number().int().positive(),
  visibility: z.enum(["public", "private"]).default("public"),
});

/**
 * Staff-only: presigned S3 PUT for course assets. The browser uploads directly
 * to S3; public/ objects are served by URL, private/ through /api/files/download.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Sign in required");
    if (!isStaffRole(viewer.profile.role)) throw new HttpError(403, "Only instructors and admins can upload");
    if (!serverEnv.s3Configured()) throw new HttpError(503, "File storage is not configured. Set S3_BUCKET and S3_REGION.");

    const body = await readJson(request, bodySchema);
    if (body.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "Files are limited to 100 MB");
    if (!isAllowedContentType(body.contentType)) throw new HttpError(415, `File type ${body.contentType} is not allowed`);

    const key = buildKey(body.visibility, body.fileName);
    const uploadUrl = await presignUpload(key, body.contentType, body.size);
    const url = body.visibility === "public" ? publicUrl(key) : null;

    await createAdminClient().from("media_assets").insert({
      key,
      url,
      visibility: body.visibility,
      content_type: body.contentType,
      size_bytes: body.size,
      file_name: body.fileName,
      uploaded_by: viewer.user.id,
    });

    return Response.json({ key, uploadUrl, url, headers: { "Content-Type": body.contentType } });
  });
}
