import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { isSupabaseConfigured } from "@/lib/env";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {!isSupabaseConfigured() && (
        <div className="border-b-4 border-ink bg-yellow px-4 py-2 text-center font-mono text-xs font-bold uppercase tracking-wider">
          Setup needed: add your Supabase keys to .env.local (see README → Setup)
        </div>
      )}
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
