"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, FileText, Lock } from "lucide-react";
import { UploadButton } from "./upload-button";
import { relativeTime } from "@/lib/utils";

interface Asset {
  id: string;
  key: string;
  url: string | null;
  visibility: "public" | "private";
  content_type: string | null;
  size_bytes: number | null;
  file_name: string | null;
  created_at: string;
}

export function MediaLibrary({ assets, configured }: { assets: Asset[]; configured: boolean }) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* blocked */
    }
  };

  return (
    <div className="space-y-6">
      <div className="card-brut flex flex-wrap items-center gap-4 p-5">
        <div className="flex-1">
          <p className="font-display font-bold">Upload to S3</p>
          <p className="text-sm text-ink/60">Public files get a permanent URL for images and videos. Private files are only downloadable through a lesson&apos;s file block.</p>
        </div>
        {configured ? (
          <>
            <UploadButton visibility="public" label="Upload public" multiple onUploaded={() => router.refresh()} />
            <UploadButton visibility="private" label="Upload private" multiple onUploaded={() => router.refresh()} />
          </>
        ) : (
          <p className="rounded-xl border-[3px] border-ink bg-yellow/40 px-3 py-2 text-sm">Set S3_BUCKET and S3_REGION to enable uploads.</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {assets.map((a) => {
          const isImage = a.content_type?.startsWith("image/") && a.url;
          const value = a.url ?? a.key;
          return (
            <div key={a.id} className="card-brut overflow-hidden">
              <div className="grid aspect-video place-items-center border-b-4 border-ink bg-paper-sunk">
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url as string} alt="" className="h-full w-full object-cover" />
                ) : a.visibility === "private" ? (
                  <Lock className="size-8 text-ink/50" />
                ) : (
                  <FileText className="size-8 text-ink/50" />
                )}
              </div>
              <div className="space-y-2 p-3">
                <p className="truncate text-sm font-semibold" title={a.file_name ?? a.key}>{a.file_name ?? a.key}</p>
                <p className="font-mono text-[11px] text-ink/60">
                  {a.visibility} · {a.size_bytes ? `${Math.round(a.size_bytes / 1024)} KB` : "—"} · {relativeTime(a.created_at)}
                </p>
                <button type="button" onClick={() => copy(value)} className="btn btn-secondary btn-sm w-full">
                  {copied === value ? <Check className="size-4" /> : <Copy className="size-4" />} Copy {a.url ? "URL" : "key"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {assets.length === 0 && <p className="text-center text-sm text-ink/60">No uploads yet.</p>}
    </div>
  );
}
