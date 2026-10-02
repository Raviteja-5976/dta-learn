import "server-only";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { serverEnv } from "@/lib/env";

/**
 * S3 storage (design §18):
 *   public/…   course images and thumbnails — public-read via bucket policy
 *   private/…  attachments and downloads — signed GET URLs (10 min) after an access check
 * Uploads go straight from the browser to S3 with a presigned PUT.
 */

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    const cfg = serverEnv.s3();
    client = new S3Client({
      region: cfg.region,
      // Without explicit keys the default chain is used (e.g. Amplify's SSR compute role).
      credentials: cfg.accessKeyId && cfg.secretAccessKey ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } : undefined,
    });
  }
  return client;
}

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const ALLOWED_TYPES = [
  /^image\/(png|jpe?g|gif|webp|svg\+xml|avif)$/,
  /^video\/(mp4|webm)$/,
  /^application\/(pdf|zip|x-zip-compressed|gzip|x-gzip|x-tar|json)$/,
  /^text\/(plain|markdown|csv)$/,
];

export function isAllowedContentType(type: string): boolean {
  return ALLOWED_TYPES.some((re) => re.test(type));
}

function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned.slice(-120) || "file";
}

export function buildKey(visibility: "public" | "private", fileName: string): string {
  const d = new Date();
  const month = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${visibility}/${month}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(fileName)}`;
}

export function publicUrl(key: string): string {
  const cfg = serverEnv.s3();
  const base = cfg.publicBaseUrl?.replace(/\/+$/, "") ?? `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function presignUpload(key: string, contentType: string, size: number): Promise<string> {
  const cfg = serverEnv.s3();
  // Signed headers must be sent unchanged by the browser: Content-Type is, and
  // Content-Length is set automatically from the file, which enforces the size.
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: size,
  });
  return getSignedUrl(s3(), command, { expiresIn: 600 });
}

export async function presignDownload(key: string, downloadName?: string): Promise<string> {
  const cfg = serverEnv.s3();
  const command = new GetObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${safeFileName(downloadName ?? key.split("/").pop() ?? "file")}"`,
  });
  return getSignedUrl(s3(), command, { expiresIn: 600 });
}
