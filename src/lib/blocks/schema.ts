import { z } from "zod";

/**
 * Article content is an ordered list of typed blocks { id, type, v, data }
 * (design §2). A new content type is a new entry here plus a renderer and an
 * editor in components/blocks — never a new database table.
 */
export const blockDataSchemas = {
  markdown: z.object({ md: z.string() }),
  code: z.object({
    language: z.string().default("bash"),
    filename: z.string().optional(),
    code: z.string(),
  }),
  callout: z.object({
    tone: z.enum(["info", "tip", "warning", "danger"]).default("info"),
    title: z.string().optional(),
    md: z.string(),
  }),
  image: z.object({
    url: z.string().min(1),
    alt: z.string().default(""),
    caption: z.string().optional(),
  }),
  video: z.object({
    provider: z.enum(["youtube", "vimeo", "bunny", "file"]).default("youtube"),
    url: z.string().min(1),
    title: z.string().optional(),
  }),
  file: z.object({
    key: z.string().min(1), // private S3 object key, served through /api/files after an access check
    name: z.string().min(1),
    size: z.number().optional(),
    description: z.string().optional(),
  }),
} as const;

export type BlockType = keyof typeof blockDataSchemas;
export const BLOCK_TYPES = Object.keys(blockDataSchemas) as BlockType[];

export type BlockData<T extends BlockType> = z.infer<(typeof blockDataSchemas)[T]>;

export type Block = {
  [T in BlockType]: { id: string; type: T; v: number; data: BlockData<T> };
}[BlockType];

export const BLOCK_LABELS: Record<BlockType, string> = {
  markdown: "Text (Markdown)",
  code: "Code snippet",
  callout: "Callout",
  image: "Image",
  video: "Video",
  file: "Downloadable file",
};

export function emptyBlock(type: BlockType): Block {
  const id = Math.random().toString(36).slice(2, 10);
  switch (type) {
    case "markdown":
      return { id, type, v: 1, data: { md: "" } };
    case "code":
      return { id, type, v: 1, data: { language: "bash", code: "" } };
    case "callout":
      return { id, type, v: 1, data: { tone: "tip", md: "" } };
    case "image":
      return { id, type, v: 1, data: { url: "", alt: "" } };
    case "video":
      return { id, type, v: 1, data: { provider: "youtube", url: "" } };
    case "file":
      return { id, type, v: 1, data: { key: "", name: "" } };
  }
}

const blockSchema = z.object({
  id: z.string().min(1),
  type: z.enum(BLOCK_TYPES as [BlockType, ...BlockType[]]),
  v: z.number().int().default(1),
  data: z.unknown(),
});

/** Validate an array of blocks, dropping invalid ones (renderers stay robust). */
export function parseBlocks(input: unknown): { blocks: Block[]; errors: string[] } {
  const errors: string[] = [];
  const blocks: Block[] = [];
  if (!Array.isArray(input)) return { blocks, errors: ["blocks must be an array"] };
  input.forEach((raw, i) => {
    const base = blockSchema.safeParse(raw);
    if (!base.success) {
      errors.push(`block ${i + 1}: ${base.error.issues[0]?.message}`);
      return;
    }
    const dataSchema = blockDataSchemas[base.data.type];
    const data = dataSchema.safeParse(base.data.data);
    if (!data.success) {
      errors.push(`block ${i + 1} (${base.data.type}): ${data.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join(", ")}`);
      return;
    }
    blocks.push({ id: base.data.id, type: base.data.type, v: base.data.v, data: data.data } as Block);
  });
  return { blocks, errors };
}

/** Rough reading time for an article (words / 200). */
export function estimateReadingMinutes(blocks: Block[]): number {
  let words = 0;
  for (const b of blocks) {
    if (b.type === "markdown" || b.type === "callout") words += b.data.md.split(/\s+/).length;
    if (b.type === "code") words += Math.round(b.data.code.split(/\s+/).length / 2);
  }
  return Math.max(1, Math.round(words / 200));
}
