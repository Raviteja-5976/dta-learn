"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export interface UploadedFile {
  key: string;
  url: string | null;
  name: string;
  size: number;
  contentType: string;
}

/** Presign on our API, then PUT straight to S3 from the browser. */
export async function uploadToS3(file: File, visibility: "public" | "private"): Promise<UploadedFile> {
  const contentType = file.type || "application/octet-stream";
  const presign = await api<{ key: string; uploadUrl: string; url: string | null }>("/api/uploads/presign", {
    body: { fileName: file.name, contentType, size: file.size, visibility },
  });
  const res = await fetch(presign.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": contentType } });
  if (!res.ok) throw new Error(`Upload failed (${res.status}). Check the bucket's CORS settings.`);
  return { key: presign.key, url: presign.url, name: file.name, size: file.size, contentType };
}

export function UploadButton({
  visibility = "public",
  accept,
  label = "Upload",
  onUploaded,
  className,
  multiple,
}: {
  visibility?: "public" | "private";
  accept?: string;
  label?: string;
  onUploaded: (file: UploadedFile) => void;
  className?: string;
  multiple?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files)) onUploaded(await uploadToS3(f, visibility));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <span className={cn("inline-flex flex-col gap-1", className)}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {busy ? "Uploading…" : label}
      </button>
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => void onFiles(e.target.files)} />
      {error && <span className="max-w-xs text-xs text-[#C2183A]">{error}</span>}
    </span>
  );
}
