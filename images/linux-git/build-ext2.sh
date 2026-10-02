#!/usr/bin/env bash
# Build the sandbox disk image as ext2 (4 KiB blocks) — design §4.10.
#
#   ./build-ext2.sh <version> <size>     e.g.  ./build-ext2.sh v1 900M
#
# Streams `docker export` into a helper container that runs mkfs.ext2 -d, so
# owners and permissions survive on Windows and macOS hosts. Output:
#   out/rootfs-linux-git-<version>.ext2   (+ .sha256)
#
# Images are IMMUTABLE: always bump the version when anything changes and
# upload under the new file name, then register it in Studio → Settings.
set -euo pipefail

VERSION="${1:?usage: $0 <version> <size>}"
SIZE="${2:-900M}"
NAME="linux-git"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/out"
TAG="dta-sandbox-$NAME:$VERSION"
IMG="rootfs-$NAME-$VERSION.ext2"

mkdir -p "$OUT"
echo "▸ building $TAG (linux/386)"
docker build --platform linux/386 -t "$TAG" "$HERE"

CID="$(docker create --platform linux/386 "$TAG")"
trap 'docker rm -f "$CID" >/dev/null 2>&1 || true' EXIT

echo "▸ creating $IMG ($SIZE)"
docker export "$CID" | docker run --rm -i -v "$OUT:/out" debian:bookworm-slim bash -euc "
  apt-get update -qq && apt-get install -y -qq e2fsprogs >/dev/null
  mkdir /rootfs && tar -x -C /rootfs
  # Seed network files Docker leaves as bind mounts.
  printf 'nameserver 127.0.0.1\n' > /rootfs/etc/resolv.conf
  printf '127.0.0.1 localhost sandbox\n::1 localhost\n' > /rootfs/etc/hosts
  echo sandbox > /rootfs/etc/hostname
  rm -f /out/$IMG
  truncate -s $SIZE /out/$IMG
  mkfs.ext2 -q -b 4096 -L sandbox -d /rootfs /out/$IMG
  e2fsck -fn /out/$IMG
"

( cd "$OUT" && sha256sum "$IMG" > "$IMG.sha256" )
echo "✓ $OUT/$IMG"
cat "$OUT/$IMG.sha256"
cat <<EOF

Next:
  1. Upload to your image bucket/CDN (range requests + CORS + CORP — see README).
  2. Check:  curl -sI -r 0-1023 -H "Origin: https://your-site" https://<cdn>/$IMG
     expect 206, Content-Range, Access-Control-Allow-Origin and Cross-Origin-Resource-Policy.
  3. Studio → Settings → Sandbox images: slug "$NAME", version ${VERSION#v}, type "bytes", URL, SHA-256.
  4. Point labs at  image: $NAME  (or $NAME:${VERSION#v} to pin).
EOF
