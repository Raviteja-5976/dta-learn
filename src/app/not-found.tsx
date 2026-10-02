import Link from "next/link";

export default function NotFound() {
  return (
    <div className="bg-grid grid min-h-dvh place-items-center p-6">
      <div className="card-brut max-w-md p-10 text-center">
        <p className="font-mono text-6xl font-bold">404</p>
        <h1 className="mt-3 font-display text-2xl font-extrabold">Nothing at this path</h1>
        <p className="mt-2 text-sm text-ink/70">
          <code className="font-mono">cd</code> somewhere else — the page may have moved, or you may need to sign in.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="btn btn-secondary">Home</Link>
          <Link href="/courses" className="btn btn-primary">Courses</Link>
        </div>
      </div>
    </div>
  );
}
