/**
 * Generic AES-256-GCM string encryption primitive.
 *
 * On-disk format: base64(IV[12] || ciphertext+tag). The Web Crypto API appends
 * the 16-byte auth tag to the ciphertext automatically, so the stored payload
 * is [12-byte IV][ciphertext+tag].
 *
 * Security:
 * - A fresh 12-byte IV is generated per encryption via crypto.getRandomValues.
 * - The symmetric key (32 bytes / 256-bit) is provided as hex via env; never
 *   hardcoded and never logged.
 * - Plaintext is never logged.
 *
 * This is the shared low-level primitive. Domain modules (PAT tokens, the
 * secrets vault) build on top of it.
 */

const IV_BYTES = 12; // 96-bit IV for AES-GCM
const KEY_BYTES = 32; // 256-bit key

/**
 * Encrypts a UTF-8 string with AES-256-GCM using a hex key.
 * Returns base64(IV || ciphertext+tag).
 */
export async function encryptString(plaintext: string, keyHex: string): Promise<string> {
  const key = await importAesKey(keyHex, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    data as BufferSource,
  );
  const cipher = new Uint8Array(cipherBuf);
  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv, 0);
  combined.set(cipher, iv.length);
  return bytesToBase64(combined);
}

/**
 * Reverses encryptString: splits IV + ciphertext+tag, decrypts.
 * Throws if the payload is malformed or the auth tag does not verify.
 */
export async function decryptString(payload: string, keyHex: string): Promise<string> {
  const combined = base64ToBytes(payload);
  if (combined.length <= IV_BYTES) {
    throw new Error('Invalid encrypted payload');
  }
  const iv = combined.slice(0, IV_BYTES);
  const cipher = combined.slice(IV_BYTES);
  const key = await importAesKey(keyHex, ['decrypt']);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    cipher as BufferSource,
  );
  return new TextDecoder().decode(plainBuf);
}

// ---------- internals ----------

export async function importAesKey(keyHex: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const keyBytes = hexToBytes(keyHex);
  if (keyBytes.length !== KEY_BYTES) {
    throw new Error(
      `AES key must be ${KEY_BYTES * 2} hex chars (${KEY_BYTES} bytes); got ${keyBytes.length} bytes`,
    );
  }
  return crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

export function bufToHex(buf: Uint8Array): string {
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    out += buf[i].toString(16).padStart(2, '0');
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const n = parseInt(hex.substring(i, i + 2), 16);
    if (Number.isNaN(n)) throw new Error('Invalid hex string');
    bytes[i / 2] = n;
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
