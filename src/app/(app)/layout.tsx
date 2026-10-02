import { SiteHeader } from "@/components/site/header";

/** App surfaces (learning player): header, no marketing footer. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
