import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { Alert, Chip, Container } from "@/components/ui";
import { Wordmark } from "@/components/site/wordmark";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidCertificateCode } from "@/lib/certificate-code";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "./print-button";
import type { Certificate } from "@/lib/types";

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ new?: string }> };

async function load(code: string): Promise<Certificate | null> {
  const c = decodeURIComponent(code).toUpperCase();
  if (!isValidCertificateCode(c)) return null;
  const { data } = await createAdminClient().from("certificates").select("*").eq("public_code", c).maybeSingle<Certificate>();
  return data ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cert = await load((await params).code);
  return cert ? { title: `Certificate · ${cert.course_title}`, description: `${cert.recipient_name} completed ${cert.course_title} on DevTrackAcademy Learn.` } : { title: "Certificate" };
}

/**
 * Public verification page (design §22): name, course, date, skills and
 * status — nothing else about the learner. Print it to save as PDF.
 */
export default async function CertificatePage({ params, searchParams }: Props) {
  const [{ code }, { new: isNew }] = await Promise.all([params, searchParams]);
  const cert = await load(code);
  if (!cert) notFound();
  const valid = cert.status === "valid";

  return (
    <Container className="space-y-8 py-[var(--sp-block)] print:p-0">
      {isNew && valid && (
        <Alert tone="success" title="Congratulations — you finished the course!" className="print:hidden">
          Your certificate is ready. Share this page&apos;s link or print it to PDF.
        </Alert>
      )}

      <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border-[6px] border-ink bg-white p-8 shadow-brut-lg print:shadow-none md:p-14">
        <div className="bg-grid absolute inset-0 opacity-60" aria-hidden />
        <div className="relative space-y-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Wordmark />
            {valid ? (
              <Chip tone="mint"><BadgeCheck className="size-3.5" /> Verified</Chip>
            ) : (
              <Chip tone="coral"><ShieldAlert className="size-3.5" /> Revoked</Chip>
            )}
          </div>
          <div className="space-y-4">
            <p className="eyebrow">Certificate of completion</p>
            <p className="text-lg text-ink/70">This certifies that</p>
            <p className="font-display text-5xl font-extrabold leading-tight md:text-6xl">
              <span className="marker">{cert.recipient_name}</span>
            </p>
            <p className="text-lg text-ink/70">has completed the course</p>
            <p className="font-display text-3xl font-bold md:text-4xl">{cert.course_title}</p>
          </div>
          {cert.skills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {cert.skills.map((s) => (
                <Chip key={s} tone="brand">{s}</Chip>
              ))}
            </div>
          )}
          <div className="grid gap-6 border-t-4 border-ink pt-6 sm:grid-cols-3">
            <Meta label="Issued" value={formatDate(cert.issued_at, { dateStyle: "long" })} />
            <Meta label="Certificate ID" value={cert.public_code} mono />
            <Meta label="Learning hours" value={cert.hours ? `${cert.hours} h` : "—"} />
          </div>
          <p className="break-all font-mono text-[10px] text-ink/40">sha256 {cert.payload_hash}</p>
        </div>
      </div>

      <div className="flex justify-center gap-3 print:hidden">
        <PrintButton />
      </div>
    </Container>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className={mono ? "font-mono text-lg font-bold" : "font-display text-lg font-bold"}>{value}</p>
    </div>
  );
}
