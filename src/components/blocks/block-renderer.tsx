import { AlertTriangle, Download, FileText, Info, Lightbulb, OctagonAlert } from "lucide-react";
import { Markdown } from "@/components/markdown";
import type { Block } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

const CALLOUT = {
  info: { icon: Info, tone: "bg-sky/30", label: "Note" },
  tip: { icon: Lightbulb, tone: "bg-mint/40", label: "Tip" },
  warning: { icon: AlertTriangle, tone: "bg-yellow/50", label: "Heads up" },
  danger: { icon: OctagonAlert, tone: "bg-coral/30", label: "Careful" },
} as const;

/** Convert a share URL to an embeddable player URL. */
export function videoEmbedUrl(provider: string, url: string): string | null {
  try {
    const u = new URL(url);
    if (provider === "youtube") {
      const id = u.hostname.includes("youtu.be") ? u.pathname.slice(1) : u.searchParams.get("v") ?? u.pathname.split("/").pop();
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (provider === "vimeo") {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${encodeURIComponent(id)}` : null;
    }
    if (provider === "bunny") return u.protocol === "https:" ? url : null; // iframe.mediadelivery.net/embed/<lib>/<id>
    return null;
  } catch {
    return null;
  }
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function BlockView({ block, itemId }: { block: Block; itemId: string }) {
  switch (block.type) {
    case "markdown":
      return <Markdown>{block.data.md}</Markdown>;

    case "code": {
      const fence = "```";
      return (
        <figure className="space-y-0">
          {block.data.filename && (
            <figcaption className="inline-flex items-center gap-1.5 rounded-t-xl border-4 border-b-0 border-ink bg-paper-sunk px-3 py-1 font-mono text-xs font-bold">
              <FileText className="size-3.5" /> {block.data.filename}
            </figcaption>
          )}
          <Markdown className={cn(block.data.filename && "[&_pre]:rounded-tl-none")}>{`${fence}${block.data.language}\n${block.data.code}\n${fence}`}</Markdown>
        </figure>
      );
    }

    case "callout": {
      const c = CALLOUT[block.data.tone];
      return (
        <aside className={cn("rounded-2xl border-4 border-ink p-5", c.tone)}>
          <p className="mb-2 flex items-center gap-2 font-display font-bold">
            <c.icon className="size-5" /> {block.data.title || c.label}
          </p>
          <Markdown compact>{block.data.md}</Markdown>
        </aside>
      );
    }

    case "image":
      return (
        <figure className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.data.url} alt={block.data.alt} loading="lazy" className="w-full rounded-2xl border-4 border-ink shadow-brut-sm" />
          {block.data.caption && <figcaption className="text-center text-sm text-ink/60">{block.data.caption}</figcaption>}
        </figure>
      );

    case "video": {
      if (block.data.provider === "file") {
        return (
          <video controls preload="metadata" src={block.data.url} className="aspect-video w-full rounded-2xl border-4 border-ink bg-ink shadow-brut-sm">
            {block.data.title}
          </video>
        );
      }
      const src = videoEmbedUrl(block.data.provider, block.data.url);
      if (!src) return <p className="text-sm text-coral">This video link could not be embedded.</p>;
      return (
        <div className="aspect-video overflow-hidden rounded-2xl border-4 border-ink bg-ink shadow-brut-sm">
          <iframe
            src={src}
            title={block.data.title ?? "Video"}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      );
    }

    case "file":
      return (
        <a
          href={`/api/files/download?item=${encodeURIComponent(itemId)}&key=${encodeURIComponent(block.data.key)}`}
          className="flex items-center gap-4 rounded-2xl border-4 border-ink bg-white p-4 shadow-brut-sm transition-transform hover:-translate-y-0.5"
        >
          <span className="grid size-11 place-items-center rounded-xl border-[3px] border-ink bg-yellow">
            <Download className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display font-bold">{block.data.name}</span>
            <span className="block text-sm text-ink/60">
              {[block.data.description, formatSize(block.data.size)].filter(Boolean).join(" · ") || "Download"}
            </span>
          </span>
        </a>
      );
  }
}

export function ArticleBody({ blocks, itemId }: { blocks: Block[]; itemId: string }) {
  if (!blocks.length) return <p className="text-ink/60">This article has no content yet.</p>;
  return (
    <div className="space-y-7">
      {blocks.map((b) => (
        <BlockView key={b.id} block={b} itemId={itemId} />
      ))}
    </div>
  );
}
