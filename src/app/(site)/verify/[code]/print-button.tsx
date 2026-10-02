"use client";

import { useState } from "react";
import { Check, Link2, Printer } from "lucide-react";

export function PrintButton() {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
        <Printer className="size-4" /> Print / save PDF
      </button>
      <button
        type="button"
        className="btn btn-primary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href.split("?")[0]);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* clipboard blocked */
          }
        }}
      >
        {copied ? <Check className="size-4" /> : <Link2 className="size-4" />} {copied ? "Link copied" : "Copy share link"}
      </button>
    </>
  );
}
