# Debian 12 (bookworm) i386 sandbox image for terminal labs (design §4.10).
# CheerpX emulates 32-bit x86, and bookworm is the last Debian with full i386.
#
# Build:   ./build-ext2.sh v1 900M      →  out/rootfs-linux-git-v1.ext2
# Never put secrets in this image: anyone can download it.
FROM --platform=linux/386 i386/debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8

# Keep docs out (man pages stay — learners use `man`), and non-English locales.
RUN printf 'path-exclude /usr/share/doc/*\npath-include /usr/share/doc/*/copyright\npath-exclude /usr/share/locale/*\npath-include /usr/share/locale/en*\npath-exclude /usr/share/info/*\n' \
      > /etc/dpkg/dpkg.cfg.d/01-slim \
 && rm -f /etc/dpkg/dpkg.cfg.d/docker* \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      bash bash-completion coreutils util-linux procps findutils grep sed gawk less man-db \
      git nano vim-tiny tree tmux curl wget file bc python3 jq zip unzip tar gzip bzip2 xz-utils \
      make gcc libc6-dev sudo locales ca-certificates sqlite3 \
 && apt-get clean && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

# Non-root learner (uid/gid 1000 — the ids the app runs as) with passwordless sudo inside the VM.
RUN groupadd -g 1000 user \
 && useradd -m -u 1000 -g 1000 -s /bin/bash user \
 && echo 'user ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/user && chmod 0440 /etc/sudoers.d/user \
 && echo sandbox > /etc/hostname

# A system-wide git identity so commits work offline before the rc runs.
RUN git config --system user.name "Learner" \
 && git config --system user.email "learner@sandbox.local" \
 && git config --system init.defaultBranch main \
 && git config --system advice.detachedHead false

# Coloured prompt and helpful aliases for login shells.
RUN printf '%s\n' \
  "PS1='\\[\\e[1;38;5;75m\\]\\u@sandbox\\[\\e[0m\\]:\\[\\e[1;38;5;222m\\]\\w\\[\\e[0m\\]\\$ '" \
  "alias ls='ls --color=auto' ll='ls -alF --color=auto' grep='grep --color=auto'" \
  >> /home/user/.bashrc \
 && mkdir -p /home/user/lessons && chown -R user:user /home/user

WORKDIR /home/user
USER user
CMD ["/bin/bash", "--login"]
