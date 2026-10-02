import { requireStaff } from "@/lib/auth";
import { StudioNav } from "@/components/studio/studio-nav";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff();
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <StudioNav isAdmin={viewer.profile.role === "admin"} />
      <div className="min-w-0 flex-1 bg-paper">{children}</div>
    </div>
  );
}
