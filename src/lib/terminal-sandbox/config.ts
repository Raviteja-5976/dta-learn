/**
 * Sandbox parameters. In the reference these were NEXT_PUBLIC_* globals; here
 * they are passed in per lab (design §4.15) so each lab version can pin its
 * own image.
 */
export type ImageType = "cloud" | "bytes" | "github";

export interface SandboxConfig {
  cheerpxVersion: string;
  imageUrl: string;
  imageType: ImageType;
  user: { name: string; uid: number; gid: number; home: string };
  /** Base shell environment (hidden commands use this unchanged). */
  env: string[];
  idleTimeoutMinutes: number;
  /** First-party analytics endpoint for sandbox beacons. */
  beaconUrl?: string;
  bootManifest?: string[] | null;
}

export function cheerpxModuleUrl(version: string): string {
  return `https://cxrtnc.leaningtech.com/${version}/cx.esm.js`;
}

export function defaultEnv(home = "/home/user", user = "user"): string[] {
  return [
    `HOME=${home}`,
    "TERM=xterm-256color",
    `USER=${user}`,
    `LOGNAME=${user}`,
    "SHELL=/bin/bash",
    "EDITOR=nano",
    "LANG=C.UTF-8",
    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  ];
}

export function makeSandboxConfig(input: {
  cheerpxVersion: string;
  imageUrl: string;
  imageType: ImageType;
  idleTimeoutMinutes?: number;
  beaconUrl?: string;
  bootManifest?: string[] | null;
}): SandboxConfig {
  const user = { name: "user", uid: 1000, gid: 1000, home: "/home/user" };
  return {
    cheerpxVersion: input.cheerpxVersion,
    imageUrl: input.imageUrl,
    imageType: input.imageType,
    user,
    env: defaultEnv(user.home, user.name),
    idleTimeoutMinutes: input.idleTimeoutMinutes ?? 30,
    beaconUrl: input.beaconUrl,
    bootManifest: input.bootManifest,
  };
}
