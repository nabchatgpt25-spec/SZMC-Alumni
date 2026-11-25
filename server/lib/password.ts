import crypto from 'crypto';

const LEGACY_STATIC_SALT = 'ndc_dhaka_1949_salt_v1:';
const SCRYPT_PREFIX = 'scrypt:';
const SCRYPT_KEYLEN = 64;

/**
 * Hashes a user password with a cryptographically random 16-byte per-user salt
 * using Node's built-in scrypt KDF.
 */
export function hashPasswordServer(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  if (raw.startsWith(SCRYPT_PREFIX) || raw.startsWith('sha256:')) return raw;
  const saltHex = crypto.randomBytes(16).toString('hex');
  const derivedHex = crypto.scryptSync(raw, saltHex, SCRYPT_KEYLEN).toString('hex');
  return `${SCRYPT_PREFIX}${saltHex}:${derivedHex}`;
}

function timingSafeHexEqual(aHex: string, bHex: string): boolean {
  if (!aHex || !bHex || aHex.length !== bHex.length) return false;
  try {
    const aBuf = Buffer.from(aHex, 'hex');
    const bBuf = Buffer.from(bHex, 'hex');
    return aBuf.length > 0 && aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

/**
 * Verifies an input password against a stored scrypt (preferred) or legacy sha256 hash.
 * Always returns false when storedHash is null, undefined, or empty.
 */
export function verifyPasswordServer(
  storedHash: string | null | undefined,
  inputPass: string
): boolean {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.trim()) {
    return false;
  }
  if (!inputPass || typeof inputPass !== 'string') {
    return false;
  }

  if (storedHash.startsWith(SCRYPT_PREFIX)) {
    const rest = storedHash.slice(SCRYPT_PREFIX.length);
    const sep = rest.indexOf(':');
    if (sep <= 0) return false;
    const saltHex = rest.slice(0, sep);
    const expectedHex = rest.slice(sep + 1);
    if (!saltHex || !expectedHex) return false;
    try {
      const derivedHex = crypto.scryptSync(inputPass, saltHex, SCRYPT_KEYLEN).toString('hex');
      return timingSafeHexEqual(derivedHex, expectedHex);
    } catch {
      return false;
    }
  }

  if (storedHash.startsWith('sha256:')) {
    const expectedHex = storedHash.slice('sha256:'.length);
    const candidateHex = crypto
      .createHash('sha256')
      .update(LEGACY_STATIC_SALT + inputPass)
      .digest('hex');
    return timingSafeHexEqual(candidateHex, expectedHex);
  }

  // Constant-time comparison fallback for legacy plain values without leaking length timing
  const aDigest = crypto.createHash('sha256').update(storedHash).digest();
  const bDigest = crypto.createHash('sha256').update(inputPass).digest();
  return crypto.timingSafeEqual(aDigest, bDigest);
}
