import { createAdminClient } from "@/lib/supabase/server";
import { isValidCertificateCode } from "@/lib/certificate-code";
import type { Certificate } from "@/lib/types";

/** Public certificate verification (design §22). Shows nothing else about the learner. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  if (!isValidCertificateCode(code)) return Response.json({ valid: false, error: "Malformed certificate code" }, { status: 400 });
  const { data } = await createAdminClient().from("certificates").select("*").eq("public_code", code).maybeSingle<Certificate>();
  if (!data) return Response.json({ valid: false }, { status: 404 });
  return Response.json(
    {
      valid: data.status === "valid",
      status: data.status,
      code: data.public_code,
      recipient: data.recipient_name,
      course: data.course_title,
      skills: data.skills,
      hours: data.hours,
      issuedAt: data.issued_at,
      payloadHash: data.payload_hash,
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
