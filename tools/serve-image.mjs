#!/usr/bin/env node
/**
 * Local CDN stand-in for sandbox images (design §4.10): serves a directory
 * with HTTP range requests, CORS and CORP so the cross-origin isolated lab
 * page can stream the image.
 *
 *   node tools/serve-image.mjs [dir=images/linux-git/out] [port=8090]
 *
 * Then register http://localhost:8090/rootfs-linux-git-v1.ext2 as a "bytes"
 * image (localhost is allowed for development).
 */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? "images/linux-git/out");
const port = Number(process.argv[3] ?? 8090);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Range",
  "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Timing-Allow-Origin": "*",
  "Accept-Ranges": "bytes",
  "Cache-Control": "public, max-age=31536000, immutable",
};

createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...headers, "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" });
    return res.end();
  }
  const file = path.join(dir, decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
  if (!file.startsWith(dir)) {
    res.writeHead(403);
    return res.end();
  }
  let size;
  try {
    size = statSync(file).size;
  } catch {
    res.writeHead(404, headers);
    return res.end("not found");
  }
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.writeHead(416, { ...headers, "Content-Range": `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, "Content-Type": "application/octet-stream", "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}` });
    if (req.method === "HEAD") return res.end();
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Type": "application/octet-stream", "Content-Length": size });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Serving ${dir} on http://localhost:${port} (range + CORS + CORP)`));
