import Link from "next/link";
import { Wordmark } from "./wordmark";

export function SiteFooter() {
  return (
    <footer className="section-dark mt-[var(--sp-section)] border-t-4 border-ink">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-14 md:grid-cols-[2fr_1fr_1fr] md:px-8">
        <div className="space-y-4">
          <Wordmark inverted />
          <p className="max-w-sm text-sm text-paper/70">
            Read a little, do it in a real environment, get checked, move on. Terminal labs run in your browser; code labs are graded on our servers.
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="eyebrow">Learn</p>
          <Link href="/courses" className="block hover:underline">Course catalog</Link>
          <Link href="/dashboard" className="block hover:underline">Your dashboard</Link>
          <Link href="/verify" className="block hover:underline">Verify a certificate</Link>
        </div>
        <div className="space-y-2 text-sm">
          <p className="eyebrow">Account</p>
          <Link href="/login" className="block hover:underline">Sign in</Link>
          <Link href="/signup" className="block hover:underline">Create account</Link>
          <Link href="/profile" className="block hover:underline">Profile</Link>
        </div>
      </div>
      <div className="border-t-2 border-paper/15">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-2 px-4 py-5 font-mono text-[11px] uppercase tracking-[0.18em] text-paper/50 md:flex-row md:justify-between md:px-8">
          <p>© {new Date().getFullYear()} DevTrackAcademy · learn.devtrackacademy.com</p>
          {/* Attribution required by the CheerpX Community licence (cheerpx.io/licensing). */}
          <p>
            Terminal labs powered by{" "}
            <a href="https://cheerpx.io" target="_blank" rel="noopener noreferrer" className="text-paper/80 underline hover:text-paper">
              CheerpX
            </a>{" "}
            from{" "}
            <a href="https://leaningtech.com" target="_blank" rel="noopener noreferrer" className="text-paper/80 underline hover:text-paper">
              Leaning Technologies
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
