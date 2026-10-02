import Link from "next/link";
import { getViewer, displayName, isStaffRole } from "@/lib/auth";
import { ButtonLink } from "@/components/ui";
import { Wordmark } from "./wordmark";
import { NavLink } from "./nav-link";
import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const viewer = await getViewer();
  const staff = isStaffRole(viewer?.profile.role);

  const links = [
    { href: "/courses", label: "Courses" },
    { href: "/pricing", label: "Pricing" },
    ...(viewer ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    ...(staff ? [{ href: "/studio", label: "Studio" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b-4 border-ink bg-paper">
      <div className="mx-auto flex h-[68px] max-w-[1320px] items-center gap-6 px-4 md:px-8">
        <Link href="/" className="shrink-0" aria-label="DevTrackAcademy Learn home">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map((l) => (
            <NavLink key={l.href} href={l.href}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {viewer ? (
            <UserMenu
              name={displayName(viewer.profile)}
              email={viewer.profile.email}
              avatarUrl={viewer.profile.avatar_url}
              role={viewer.profile.role}
            />
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                Sign in
              </ButtonLink>
              {/* Primary CTA stays visible on mobile (design checklist) */}
              <ButtonLink href="/signup" size="sm">
                Start learning
              </ButtonLink>
            </>
          )}
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t-2 border-ink/15 px-4 py-1.5 md:hidden" aria-label="Main (mobile)">
        {links.map((l) => (
          <NavLink key={l.href} href={l.href}>
            {l.label}
          </NavLink>
        ))}
        {!viewer && (
          <NavLink href="/login">Sign in</NavLink>
        )}
      </nav>
    </header>
  );
}
