import { Container } from "@/components/ui";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-grid border-b-4 border-ink">
      <Container className="flex min-h-[calc(100dvh-72px)] items-center justify-center py-12">
        <div className="card-brut w-full max-w-md p-8">
          <h1 className="font-display text-3xl font-extrabold">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink/70">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </Container>
    </div>
  );
}
