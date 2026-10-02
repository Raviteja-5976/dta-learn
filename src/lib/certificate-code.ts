/**
 * Certificate public ids (design §22): DTA-XXXX-XXXX-C — 8 random Crockford
 * base32 characters plus a weighted check character. Random, not sequential.
 */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function checkChar(chars: string[]): string {
  return CROCKFORD[chars.reduce((sum, ch, i) => sum + CROCKFORD.indexOf(ch) * (i + 1), 0) % 32];
}

export function generateCertificateCode(randomIndex: (max: number) => number = (max) => crypto.getRandomValues(new Uint32Array(1))[0] % max): string {
  const chars = Array.from({ length: 8 }, () => CROCKFORD[randomIndex(32)]);
  return `DTA-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}-${checkChar(chars)}`;
}

export function isValidCertificateCode(code: string): boolean {
  const m = /^DTA-([0-9A-HJKMNP-TV-Z]{4})-([0-9A-HJKMNP-TV-Z]{4})-([0-9A-HJKMNP-TV-Z])$/.exec(code);
  if (!m) return false;
  return checkChar((m[1] + m[2]).split("")) === m[3];
}
