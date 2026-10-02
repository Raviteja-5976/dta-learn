import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui";

export const metadata: Metadata = { title: "Verify a certificate" };

async function lookup(formData: FormData) {
  "use server";
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (code) redirect(`/verify/${encodeURIComponent(code)}`);
}

export default function VerifyIndexPage() {
  return (
    <Container className="flex justify-center py-[var(--sp-section)]">
      <div className="card-brut w-full max-w-lg space-y-6 p-8">
        <ShieldCheck className="size-10" />
        <div>
          <h1 className="font-display text-3xl font-extrabold">Verify a certificate</h1>
          <p className="mt-2 text-sm text-ink/70">Enter the code printed on the certificate, like <code className="font-mono">DTA-7K4M-9QX2-R</code>.</p>
        </div>
        <form action={lookup} className="flex gap-3">
          <label htmlFor="code" className="sr-only">Certificate code</label>
          <input id="code" name="code" required placeholder="DTA-XXXX-XXXX-X" className="input-brut font-mono uppercase" />
          <button type="submit" className="btn btn-primary">Verify</button>
        </form>
      </div>
    </Container>
  );
}
